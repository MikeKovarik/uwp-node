using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using Windows.Foundation.Collections;


namespace UwpNodeBroker {

	class ChildProcess {

		private ValueSet req;
		private Process Proc;
		private ProcessStartInfo Info;
		private NamedPipe[] Pipes;
		private string[] Stdio = new string[0];

		public int Cid;
		public bool Killed = false;
		public event Action Disposed;


		public ChildProcess(ValueSet req) {
			try {
				this.req = req;
				Proc = new Process();
				// Read custom ID used to identify this process.
				Cid = Convert.ToInt32(req["cid"]);
				// The process could be spawned in long-running mode and non-blockingly listened to - cp.spawn().
				// Or launched and blockingly waited out for exit - cp.exec().
				var isLongRunning = req["startProcess"] as string == "spawn";
				SetupInfo();
				SetupStdio();
				if (isLongRunning)
					SetupStdioPipes();
				// Start the process.
				if (isLongRunning) {
					// Long running with asynchronous evented STDIO.
					Spawn();
				} else {
					// One time execution, blocking until process closes, reads STDOUT and STDERR at once.
					Task.Run(Exec);
				}
			} catch (Exception err) {
				HandleError(err);
			}
		}

		private void SetupInfo() {
			Proc.StartInfo = Info = new ProcessStartInfo();
			// Create the process without (visible) window.
			Info.WindowStyle = ProcessWindowStyle.Hidden;
			Info.CreateNoWindow = true;
			Info.UseShellExecute = false;
			// Request admin access if needed (prompts UAC dialog)
			//if (req.ContainsKey("admin"))
			//	Info.Verb = "runas";
			// Setup file and to be started and with what arguments.
			Info.FileName = req["file"] as string;
			if (req.ContainsKey("args")) {
				// C# strings are utf16 by default. Encoding of arguments property cannot be controlled
				// like stdio streams with so we need to convert the args manually. 
				var utf16 = req["args"] as string;
				var buffer = Encoding.Default.GetBytes(utf16);
				var utf8 = Encoding.UTF8.GetString(buffer, 0, buffer.Length);
				Info.Arguments = utf8;
			}
			if (req.ContainsKey("cwd")) {
				Info.WorkingDirectory = req["cwd"] as string;
			}
		}

		private void SetupStdio() {
			// Pipes need to be created before the node process even starts
			if (req.ContainsKey("stdio")) {
				Stdio = (req["stdio"] as string).Split('|');
				for (int i = 0; i < Stdio.Length; i++) {
					// stdio array from js comes in stringified so the nulls have to be tured into proper null again.
					if (Stdio[i] == "null" || Stdio[i] == "ignore")
						Stdio[i] = null;
				}
			} else {
				Stdio = new string[0];
			}

			Info.StandardOutputEncoding = Encoding.UTF8;
			Info.StandardErrorEncoding = Encoding.UTF8;

			// Request access to STDIO
			if (Stdio.Length > 0 && Stdio[0] != null) Proc.StartInfo.RedirectStandardInput = true;
			if (Stdio.Length > 1 && Stdio[1] != null) Proc.StartInfo.RedirectStandardOutput = true;
			if (Stdio.Length > 2 && Stdio[2] != null) Proc.StartInfo.RedirectStandardError = true;
		}

		private void SetupStdioPipes() {
			// Only long running processes created with spawn() can be communicate asynchronously through custom pipes.
			Pipes = new NamedPipe[Stdio.Length];
			List<String> pipeNames = new List<String>();
			// Skip the holy trinity of STDIO (IN/OUT/ERR) and start at custom pipes.
			int fd = 3;
			// Few variables used for creation of pipe name.
			var newProcRandomNum = (new Random()).Next(0, 10000); // NOTE: ideally libuv/node would use win32 handle.
			var brokerPid = Process.GetCurrentProcess().Id;
			// Create custom pipes for the other remaining (defined by user) stdio pipes.
			foreach (var type in Stdio.Skip(fd)) {
				var name = $"uwp-node\\{newProcRandomNum}-{fd}-{brokerPid}";
				pipeNames.Add(name);
				var pipe = new NamedPipe(name);
				pipe.fd = fd;
				// Handle and report all output and errors of the pipe.
				pipe.Data += async data => await ReportData(data, pipe.fd);
				pipe.Error += async err => await ReportError(err, pipe.fd);
				// Pushing null to stream causes it to close and emit 'end' event.
				pipe.End += async () => await ReportData(null, pipe.fd);
				Pipes[fd] = pipe;
				fd++;
			}
			// SIDE-NOTE: Because there's no easy way of creating libuv-style named-pipes that would get picked up by node
			// natively, we have to pass in through env vars custom list of names of pipes that we're creating in C#
			// that JS side of of uwp-node has too bind to.
			Info.EnvironmentVariables.Add("uwp-node-stdio-pipes", string.Join("|", pipeNames));
			if (Stdio.Contains("ipc")) {
				int ipcFd = Array.FindIndex(Stdio, item => item == "ipc");
				Info.EnvironmentVariables.Add("uwp-node-stdio-ipc", ipcFd.ToString());
			}
		}

		// Starts the process as long running with asynchronous evented STDIO.
		public async void Spawn() {
			try {
				// Semaphore for STDOUT/STDERR and exited events.
				// Exited event is in most cases emitted before OutputDataReceived and thus before reading STDIO
				// was finished. Using these Task we can safely run after-exit code once all three Tasks are completed
				// e.g. once STDOUT and STDERR are read and once Exited event is fired.
				// Task objects th
				var exitedEvent = new TaskCompletionSource<object>();
				var stdoutEvent = new TaskCompletionSource<object>();
				var stderrEvent = new TaskCompletionSource<object>();

				// Handle lifecycle events
				Proc.EnableRaisingEvents = true;
				// Resolves one of the three events in semaphore.
				Proc.Exited   += (s, e) => exitedEvent.SetResult(null);
				// The class has been disposed (and futher attempts to do so within the methods will fail, throw and be caught)
				// but we need to make sure that the pipes and other objects are all cleared of all references to this process.
				Proc.Disposed += (s, e) => Dispose();

				// Attach handlers for STDOUT and STDERR
				// NOTE: Once the stream ends, it will call this method with e.Data=null. We then propagate the null to UWP
				// where it naturally ends the stream (uses the same 'stream' library from Node's core)
				if (Info.RedirectStandardOutput) {
					Proc.OutputDataReceived += async (s, e) => {
						if (e.Data?.Length > 0) {
							await ReportData(e.Data + "\n", 1);
						} else if (e.Data == null) {
							await ReportData(null, 1);
							stdoutEvent.SetResult(null);
						}
					};
				}
				if (Info.RedirectStandardError) {
					Proc.ErrorDataReceived += async (s, e) => {
						if (e.Data?.Length > 0) {
							await ReportData(e.Data + "\n", 2);
						} else if (e.Data == null) {
							await ReportData(null, 2);
							stderrEvent.SetResult(null);
						}
					};
				}

				// Start the process and begin receiving data on STDIO streams.
				Proc.Start();
				if (Info.RedirectStandardOutput) Proc.BeginOutputReadLine();
				if (Info.RedirectStandardError)  Proc.BeginErrorReadLine();

				// Report back first basic information about the established process.
				await Report("pid", Proc.Id);

				// Now that we reported PID and the process is running, await it's exit and 
				await Task.WhenAll(exitedEvent.Task, stdoutEvent.Task, stderrEvent.Task);

				// We can now safely report exit code and dispose the process and all references.
				if (Killed) {
					// Node processes treat killed processes with null exit code as opposed to C# which uses -1.
					await Report("exitCode", null);
				} else {
					try {
						await Report("exitCode", Proc.ExitCode);
					} catch {
						await Report("exitCode", -1);
					}
				}

				Dispose();
			} catch (Exception err) {
				HandleError(err);
			}
		}

		// One time execution, blocking until process closes, reads STDOUT and STDERR at once.
		public async Task Exec() {
			try {
				// Start the process (blocking until it exits) and read all data from STDOUT and STDERR.
				Proc.Start();
				var res = new ValueSet();
				if (Info.RedirectStandardOutput) {
					var data = Proc.StandardOutput.ReadToEnd();
					if (data?.Length > 0)
						await ReportData(data, 1);
					await ReportData(null, 1);
				}
				if (Info.RedirectStandardError) {
					var data = Proc.StandardError.ReadToEnd();
					if (data?.Length > 0)
						await ReportData(data, 2);
					await ReportData(null, 2);
				}
				// Synchronously block the task until the process exits.
				Proc.WaitForExit();
				// Report back information about the process.
				await Report("exitCode", Proc.ExitCode);
				// Close the process, release all resources and emit processClosed event.
				Dispose();
			} catch (Exception err) {
				HandleError(err);
			}
		}

		private async void HandleError(Exception err) {
			switch (err.Message) {
				case "The system cannot find the file specified":
					await Report("exitCode", -4058); // ENOENT
					break;
				default:
					await ReportError(err.Message, err.StackTrace);
					break;
			}
			Dispose();
		}


		///////////////////////////////////////////////////////////////////////
		// IN / OUT
		///////////////////////////////////////////////////////////////////////

		// Writes to the process' STDIN or other given named pipe.
		public async void Write(byte[] buffer, int fd = 0) {
			if (fd == 0) {
				// Writes data to STDIN.
				string str = Encoding.Default.GetString(buffer, 0, buffer.Length);
				await Proc.StandardInput.WriteAsync(str);
				await Proc.StandardInput.FlushAsync();
			} else if (fd > 2) {
				// Writes data to custom named pipes.
				if (Pipes.Length < fd && Pipes[fd] != null)
					await Pipes[fd].Write(buffer);
			}
		}

		private async Task ReportData(object data, int fd) {
			ValueSet message = new ValueSet();
			message.Add("fd", fd);
			message.Add("data", data);
			await Report(message);
		}

		private async Task ReportError(object err, int fd) {
			ValueSet message = new ValueSet();
			message.Add("fd", fd);
			message.Add("error", err);
			await Report(message);
		}

		private async Task ReportError(string err, string stack) {
			ValueSet message = new ValueSet();
			message.Add("error", err);
			message.Add("stack", stack);
			await Report(message);
		}

		private async Task ReportError(object err) {
			ValueSet message = new ValueSet();
			message.Add("error", err);
			await Report(message);
		}

		private async Task Report(string key, object val) {
			ValueSet message = new ValueSet();
			message.Add(key, val);
			await Report(message);
		}

		private async Task Report(ValueSet message) {
			message.Add("cid", Cid);
			await UWP.Send(message);
		}


		///////////////////////////////////////////////////////////////////////
		// DISPOSE
		///////////////////////////////////////////////////////////////////////

		public void Kill() {
			Killed = true;
			if (!Proc.HasExited)
				Proc.Kill();
		}

		// Closes the process, releases all resources & emits Disposed event.
		public void Dispose() {
			//Console.WriteLine($"### Dispose {Cid}");
			if (Proc != null) {
				try {
					//Proc.Disposed -= OnDisposed;
					//Proc.Exited -= OnExited;
					Proc.Close();
					Proc.Dispose();
				} catch { }
			}
			if (Pipes != null) {
				foreach (NamedPipe pipe in Pipes) {
					pipe?.Dispose();
				}
			}
			if (Proc != null || Pipes != null) {
				Proc = null;
				Info = null;
				Stdio = null;
				Pipes = null;
				Disposed?.Invoke();
				Disposed = null;
			}
		}


	}

}
