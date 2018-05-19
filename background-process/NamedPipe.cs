using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Pipes;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace BackgroundProcess {

    class NamedPipe {

        List<NamedPipeServerStream> pipes = new List<NamedPipeServerStream>();
        List<NamedPipeServerStream> connections = new List<NamedPipeServerStream>();

        public event EventHandler<Object> data;
        public event EventHandler<Object> connection;
        public event EventHandler<Object> end;
        public event EventHandler<Object> error;

        string name;
        int chunksize = 665536;
        int maxInstances = 1;
        PipeDirection direction = PipeDirection.InOut;
        PipeTransmissionMode mode = PipeTransmissionMode.Byte;
        PipeOptions options = PipeOptions.Asynchronous;

        public NamedPipe(string name, int maxInstances = 1) {
            this.name = name;
            this.maxInstances = maxInstances;
            Create();
        }

        private void Create() {
            NamedPipeServerStream pipe = null;
            try {
                pipe = new NamedPipeServerStream(name, direction, maxInstances, mode, options, chunksize, chunksize);
                pipes.Add(pipe);
                StartListening(pipe);
            } catch (Exception err) {
                OnError(pipe, err);
            }
        }

        private void StartListening(NamedPipeServerStream pipe) => Task.Factory.StartNew(() => {
            pipe.WaitForConnection();
            // Client connected to this server.
            connections.Add(pipe);
            // Fire connection event.
            connection?.Invoke(this, null);
            // Start another parallel stream server if needed.
            if (maxInstances > pipes.Count)
                Create();
            StartReading(pipe);
        });

        private Task StartReading(NamedPipeServerStream pipe) => Task.Factory.StartNew(async () => {
            try {
                // Serve is ready, start reading
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
                    data?.Invoke(this, trimmed);
                    //MemoryStream trimmed = new MemoryStream();
                    //trimmed.Write(buffer, 0, bytesRead);
                }
            } catch (Exception err) {
                OnError(pipe, err);
            }
        });

        private void OnDisconnect(NamedPipeServerStream pipe) {
            ClosePipe(pipe);
            end?.Invoke(this, null);
        }

        private void OnError(NamedPipeServerStream pipe, Exception err) {
            ClosePipe(pipe);
            error?.Invoke(this, err.ToString());
        }

        private void ClosePipe(NamedPipeServerStream pipe) {
            if (pipes.Contains(pipe))
                pipes.Remove(pipe);
            if (connections.Contains(pipe))
                connections.Remove(pipe);
        }

        public void Close() {
            foreach (var pipe in pipes) {
                try {
                    pipe.Disconnect();
                } catch { }
                pipe.Dispose();
            }
        }

        public async Task Write(string message) {
            byte[] buffer = Encoding.UTF8.GetBytes(message);
            await Write(buffer);
        }

        public async Task Write(byte[] buffer, object pipeToExclude = null) {
            List<Task> tasks = new List<Task>();
            //if (pipeToExclude != null)
            //    pipeToExclude = pipeToExclude as NamedPipeServerStream;
            foreach (var pipe in connections) {
                if (pipe.CanWrite && pipe != pipeToExclude) {
                    var task = Task.Run(async () => {
                        await pipe.WriteAsync(buffer, 0, buffer.Length);
                        await pipe.FlushAsync();
                    });
                    tasks.Add(task);
                }
            }
            await Task.WhenAll(tasks);
        }

    }

}
