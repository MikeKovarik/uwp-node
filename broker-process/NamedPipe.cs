﻿using System;
using System.Collections.Generic;
using System.IO.Pipes;
using System.Text;
using System.Threading.Tasks;
using System.Linq;


namespace UwpNodeBroker {

	class NamedPipe {

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

		public bool Disposed = false;
		public string name;
		public int fd;
		int chunksize = 665536;
		int maxInstances = 1;
		PipeDirection direction = PipeDirection.InOut;
		PipeTransmissionMode mode = PipeTransmissionMode.Byte;
		PipeOptions options = PipeOptions.Asynchronous;

		private TaskQueue queue = new TaskQueue();

		public NamedPipe(string name, int maxInstances = 1) {
			queue.Enqueue(Ready.Task);
			this.name = name;
			this.maxInstances = maxInstances;
			CreateNewPipe();
		}

		private void CreateNewPipe() {
			NamedPipeServerStream pipe = null;
			try {
				pipe = new NamedPipeServerStream(name, direction, maxInstances, mode, options, chunksize, chunksize);
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
				if (maxInstances > Servers.Count)
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
				Console.WriteLine($"C#: NamedPipe ERROR {name} - {err}");
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
			} catch { }
			pipe.Dispose();
		}

		public void Dispose() {
			while (Servers.Count > 0)
				DisposePipe(Servers[0]);
			while (Clients.Count > 0)
				DisposePipe(Clients[0]);
			End?.Invoke();
			// Remove references to event handlers.
			Data = null;
			Connection = null;
			End = null;
			Error = null;
			Disposed = true;
		}

		public async Task Write(string message, NamedPipeServerStream exclude = null) {
			byte[] buffer = Encoding.UTF8.GetBytes(message);
			await Write(buffer, exclude);
		}

		public async Task Write(byte[] buffer, NamedPipeServerStream exclude = null) {
			if (Disposed) return;
			// NOTE: wrapping in async/await because all Task methods are hot (running)
			// whereas new Task(...) unlike Task.Run(...) returns cold Task that has to be started
			// with task.Start() method.
			await queue.Enqueue(new Task(async () => await WriteToAllPipes(buffer, exclude)));
		}

		private async Task WriteToAllPipes(byte[] buffer, NamedPipeServerStream exclude = null) {
			if (Disposed) return;
			var tasks = Clients
				.Where(pipe => pipe.CanWrite && pipe != exclude)
				.Select(pipe => WriteToPipe(buffer, pipe))
				.ToList();
			await Task.WhenAll(tasks);
		}

		private async Task WriteToPipe(byte[] buffer, NamedPipeServerStream pipe) {
			if (Disposed) return;
			await pipe.WriteAsync(buffer, 0, buffer.Length);
			await pipe.FlushAsync();
		}

	}


	// FIFO Task queue for cold (not yet started) Tasks.
	// Each task will be started when necessary.
	class TaskQueue {

		private List<Task> Queue = new List<Task>();
		private bool Running = false;

		public Task Enqueue(Task task) {
			if (task != null)
				Queue.Add(task);
			Next();
			return task;
		}

		private void Next() {
			if (!Running && Queue.Count > 0)
				RunTask(Queue[0]);
		}

		private async void RunTask(Task task) {
			Running = true;
			if (task.Status == TaskStatus.Created) {
				// WARNING: Start sometimes throws "Start may not be called on a task that was already started"
				// despite still having Created (= not yet started) status.
				try {
					task.Start();
				} catch {}
			}
			await task;
			Running = false;
			Queue.Remove(task);
			Next();
		}

	}

}
