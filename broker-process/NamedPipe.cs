using System;
using System.IO.Pipes;
using System.Text;
using System.Linq;
using System.Collections.Generic;
using System.Collections.Concurrent;
using System.Threading;
using System.Threading.Tasks;


namespace UwpNodeBroker {

	class NamedPipe : IDisposable {

		List<NamedPipeServerStream> Servers = new List<NamedPipeServerStream>();
		List<NamedPipeServerStream> Clients = new List<NamedPipeServerStream>();

		private TaskCompletionSource<bool> Ready = new TaskCompletionSource<bool>();

		public event Action Connection;
		public event Action<byte[], NamedPipeServerStream> Data;
		public event Action<string, NamedPipeServerStream> Error;
		public event Action End;

		public bool Connected {
			get { return Clients.Count > 0; }
		}

		public bool IsDisposed = false;
		public string Name;
		public int fd;
		int MaxInstances = 1;
		static int ChunkSize = 665536;
		static PipeDirection Direction = PipeDirection.InOut;
		static PipeTransmissionMode Mode = PipeTransmissionMode.Byte;
		static PipeOptions Options = PipeOptions.Asynchronous;

		private TaskQueue queue = new TaskQueue();

		public NamedPipe(string Name, int MaxInstances = 1) {
			queue.Enqueue(Ready.Task);
			this.Name = Name;
			this.MaxInstances = MaxInstances;
			CreateNewPipe();
		}

		private void CreateNewPipe() {
			NamedPipeServerStream pipe = null;
			try {
				pipe = new NamedPipeServerStream(Name, Direction, MaxInstances, Mode, Options, ChunkSize, ChunkSize);
				Servers.Add(pipe);
				StartListening(pipe);
			} catch (Exception err) {
				OnError(pipe, err);
				Ready.TrySetResult(false);
			}
		}

		private void StartListening(NamedPipeServerStream pipe) => Task.Factory.StartNew(() => {
			try {
				pipe.WaitForConnection();
			} catch (Exception err) {
				// WaitForConnection() throws if no connection is received and pipe closes.
				// We don't consider it an error but just a simple closing.
				OnError(pipe, err, false);
				Ready.TrySetResult(false);
				return;
			}
			try {
				// Client connected to this server.
				Clients.Add(pipe);
				// Fire connection event.
				Connection?.Invoke();
				Ready.TrySetResult(true);
				// Start another parallel stream server if needed.
				if (MaxInstances > Servers.Count)
					CreateNewPipe();
				StartReading(pipe);
			} catch (Exception err) {
				// NOTE: WaitForConnection() throws if no connection is received and pipe closes.
				OnError(pipe, err);
				Ready.TrySetResult(false);
			}
		});

		private Task StartReading(NamedPipeServerStream pipe) => Task.Factory.StartNew(async () => {
			try {
				// Server is ready, start reading
				byte[] buffer = new byte[ChunkSize];
				while (pipe.CanRead) {
					if (!pipe.IsConnected) {
						OnDisconnect(pipe);
						break;
					}
					int bytesRead = await pipe.ReadAsync(buffer, 0, ChunkSize);
					if (bytesRead == 0) {
						OnDisconnect(pipe);
						break;
					}
					byte[] trimmed = new byte[bytesRead];
					Array.Copy(buffer, trimmed, bytesRead);
					Data?.Invoke(trimmed, pipe);
					//MemoryStream trimmed = new MemoryStream();
					//trimmed.Write(buffer, 0, bytesRead);
				}
			} catch (Exception err) {
				OnError(pipe, err);
			}
		});

		private void OnError(NamedPipeServerStream pipe, Exception err, bool isError = true) {
			if (isError) {
				Console.WriteLine($"C#: NamedPipe ERROR {Name} - {err}");
				Error?.Invoke(err.ToString(), pipe);
			}
			OnDisconnect(pipe);
		}

		private void OnDisconnect(NamedPipeServerStream pipe) {
			DisposePipe(pipe);
			MaybeDisposeAll();
		}

		private void MaybeDisposeAll() {
			if (Servers.Count == 0)
			//if (Clients.Count == 0)
				Dispose();
		}

		public void DisposePipe(NamedPipeServerStream pipe) {
			if (pipe == null)
				return;
			if (Servers.Contains(pipe))
				Servers.Remove(pipe);
			if (Clients.Contains(pipe))
				Clients.Remove(pipe);
			try {
				pipe.Disconnect();
			} catch {}
			pipe.Dispose();
		}

		public void Dispose() {
			if (IsDisposed) return;
			IsDisposed = true;
			while (Servers.Count > 0)
				DisposePipe(Servers[0]);
			while (Clients.Count > 0)
				DisposePipe(Clients[0]);
			if (End != null) {
				End.Invoke();
				foreach (Action listener in End.GetInvocationList())
					End -= listener;
			}
			// Remove event listeners.
			if (Data != null)
				foreach (Action<byte[], NamedPipeServerStream> listener in Data.GetInvocationList())
					Data -= listener;
			if (Connection != null)
				foreach (Action listener in Connection.GetInvocationList())
					Connection -= listener;
			if (Error != null)
				foreach (Action<string, NamedPipeServerStream> listener in Error.GetInvocationList())
					Error -= listener;
		}

		public async Task Write(string message, NamedPipeServerStream exclude = null) {
			byte[] buffer = Encoding.UTF8.GetBytes(message);
			await Write(buffer, exclude);
		}

		public async Task Write(byte[] buffer, NamedPipeServerStream exclude = null) {
			if (IsDisposed) return;
			// NOTE: wrapping in async/await because all Task methods are hot (running)
			// whereas new Task(...) unlike Task.Run(...) returns cold Task that has to be started
			// with task.Start() method.
			await queue.Enqueue(async () => await WriteToAllPipes(buffer, exclude));
		}

		private async Task WriteToAllPipes(byte[] buffer, NamedPipeServerStream exclude = null) {
			if (IsDisposed) return;
			var tasks = Clients
				.ToList() // This is to prevent error "Collection was modified; enumeration operation may not execute"
				.Where(pipe => pipe.CanWrite && pipe != exclude)
				.Select(pipe => WriteToPipe(buffer, pipe))
				.ToList();
			await Task.WhenAll(tasks);
		}

		private async Task WriteToPipe(byte[] buffer, NamedPipeServerStream pipe) {
			if (IsDisposed) return;
			try {
				await pipe.WriteAsync(buffer, 0, buffer.Length);
				await pipe.FlushAsync();
			} catch {}
		}

	}


	// FIFO Task queue for cold (not yet started) Tasks.
	// Each task will be started when necessary.
	class TaskQueue {

		private readonly ConcurrentQueue<Task> queue = new ConcurrentQueue<Task>();
		private bool Running = false;

		public Task Enqueue(Action func) {
			return Enqueue(new Task(func));
		}

		public Task Enqueue(Task task) {
			if (task != null)
				queue.Enqueue(task);
			Run();
			return task;
		}

		private async void Run() {
			if (Running) return;
			Running = true;
			while (!queue.IsEmpty) {
				if (!queue.TryDequeue(out Task task)) continue;
				if (task == null) continue;
				var status = task.Status;
				if (status == TaskStatus.Created) {
					try {
						task.Start();
					} catch (Exception err) {
						Console.WriteLine($"TaskQueue error {err}");
					}
				}
				if (status != TaskStatus.Faulted
				 && status != TaskStatus.RanToCompletion
				 && status != TaskStatus.Canceled)
					await task;
			}
			Running = false;
		}

	}

}
