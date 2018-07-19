using System;
using System.Collections.Generic;
using System.IO.Pipes;
using System.Text;
using System.Threading.Tasks;
using System.Linq;


namespace UwpNodeBroker {

	class NamedPipe {

		List<NamedPipeServerStream> Pipes = new List<NamedPipeServerStream>();
		List<NamedPipeServerStream> Connections = new List<NamedPipeServerStream>();

		private TaskCompletionSource<bool> Ready = new TaskCompletionSource<bool>();

		public event Action Connection;
		public event Action<byte[]> Data;
		public event Action End;
		public event Action<string> Error;

		public bool Connected {
			get { return Connections.Count > 0; }
		}

		public bool Disposed = false;
		public string name;
		public int fd;
		int chunksize = 665536;
		int maxInstances = 1;
		PipeDirection direction = PipeDirection.InOut;
		PipeTransmissionMode mode = PipeTransmissionMode.Byte;
		PipeOptions options = PipeOptions.Asynchronous;

		public NamedPipe(string name, int maxInstances = 1) {
			this.name = name;
			this.maxInstances = maxInstances;
			CreateNewPipe();
		}

		private void CreateNewPipe() {
			NamedPipeServerStream pipe = null;
			try {
				pipe = new NamedPipeServerStream(name, direction, maxInstances, mode, options, chunksize, chunksize);
				Pipes.Add(pipe);
				StartListening(pipe);
			} catch (Exception err) {
				Ready.SetResult(false);
				OnError(pipe, err);
			}
		}

		private void StartListening(NamedPipeServerStream pipe) => Task.Factory.StartNew(() => {
			try {
				pipe.WaitForConnection();
				// Client connected to this server.
				Connections.Add(pipe);
				// Fire connection event.
				Connection?.Invoke();
				Ready.SetResult(true);
				// Start another parallel stream server if needed.
				if (maxInstances > Pipes.Count)
					CreateNewPipe();
				StartReading(pipe);
			} catch {
				//Console.WriteLine($"Pipe {name} did not start listening");
				Ready.SetResult(false);
				DisposePipe(pipe);
			}
		});

		private Task StartReading(NamedPipeServerStream pipe) => Task.Factory.StartNew(async () => {
			try {
				// Server is ready, start reading
				byte[] buffer = new byte[chunksize];
				while (pipe.CanRead) {
					if (!pipe.IsConnected) {
						OnDisconnect(pipe);
						break;
					}
					int bytesRead = await pipe.ReadAsync(buffer, 0, chunksize);
					if (bytesRead == 0) {
						OnDisconnect(pipe);
						break;
					}
					byte[] trimmed = new byte[bytesRead];
					Array.Copy(buffer, trimmed, bytesRead);
					Data?.Invoke(trimmed);
					//MemoryStream trimmed = new MemoryStream();
					//trimmed.Write(buffer, 0, bytesRead);
				}
			} catch (Exception err) {
				OnError(pipe, err);
			}
		});

		private void OnDisconnect(NamedPipeServerStream pipe) {
			DisposePipe(pipe);
			if (Connections.Count == 0)
				Dispose();
		}

		private void OnError(NamedPipeServerStream pipe, Exception err) {
			DisposePipe(pipe);
			Error?.Invoke(err.ToString());
			if (Connections.Count == 0)
				Dispose();
		}

		public void DisposePipe(NamedPipeServerStream pipe) {
			if (pipe == null)
				return;
			if (Pipes.Contains(pipe))
				Pipes.Remove(pipe);
			if (Connections.Contains(pipe))
				Connections.Remove(pipe);
			try {
				pipe.Disconnect();
			} catch { }
			pipe.Dispose();
		}

		public void Dispose() {
			while (Pipes.Count > 0)
				DisposePipe(Pipes[0]);
			End?.Invoke();
			// Remove references to event handlers.
			Data = null;
			Connection = null;
			End = null;
			Error = null;
			Disposed = true;
		}

		public async Task Write(string message) {
			byte[] buffer = Encoding.UTF8.GetBytes(message);
			await Write(buffer);
		}

		public async Task Write(byte[] buffer, NamedPipeServerStream exclude = null) {
			if (Disposed) return;
			if (!Connected) await Ready.Task;
			var tasks = Connections
				.Where(pipe => pipe.CanWrite && pipe != exclude)
				.Select(pipe => Task.Run(async () => {
					await pipe.WriteAsync(buffer, 0, buffer.Length);
					await pipe.FlushAsync();
				}))
				.ToList();
			await Task.WhenAll(tasks);
		}

	}

}
