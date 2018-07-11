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

		public int Pid;
		public int Cid;
		public event Action Disposed;
		public Task Ready;


		public ChildProcess(ValueSet req) {
			this.req = req;
			Proc = new Process();
			// Read custom ID used to identify this process.
			Cid = (int) req["cid"];
			// The process could be spawned in long-running mode and non-blockingly listened to - cp.spawn().
			// Or launched and blockingly waited out for exit - cp.exec().
			var isLongRunning = req["startProcess"] as string == "spawn";
			try {
				SetupInfo();
				SetupStdio();
				if (isLongRunning)
					SetupStdioPipes();
			} catch (Exception err) {
				HandleError(err);
			}
			// Start the process.
			if (isLongRunning) {
				// Long running with asynchronous evented STDIO.
				Ready = Spawn();
			} else {
				// One time execution, blocking until process closes, reads STDOUT and STDERR at once.
				Ready = Task.Run(() => Exec());
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
			// Setup what and where to start
			Info.FileName = req["program"] as string;
			if (req.ContainsKey("args")) Info.Arguments        = req["args"] as string;
			if (req.ContainsKey("cwd"))  Info.WorkingDirectory = req["cwd"] as string;
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
				pipe.Data += data => ReportData(data, pipe.fd);
				pipe.Error += err => ReportError(err, pipe.fd);
				// Pushing null to stream causes it to close and emit 'end' event.
				pipe.End += () => ReportData(null, pipe.fd);
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
		public async Task Spawn() {
			try {
				// Handle lifecycle events
				Proc.EnableRaisingEvents = true;
				Proc.Exited   += OnExited;
				Proc.Disposed += OnDisposed;
				// Attach handlers for STDOUT and STDERR
				// NOTE: Once the stream ends, it will call this method with e.Data=null. We then propagate the null to UWP
				// where it naturally ends the stream (uses the same 'stream' library from Node's core)
				if (Info.RedirectStandardOutput) Proc.OutputDataReceived += (s, e) => ReportData(e.Data, 1);
				if (Info.RedirectStandardError)  Proc.ErrorDataReceived  += (s, e) => ReportData(e.Data, 2);
				// Start the process and begin receiving data on STDIO streams.
				Proc.Start();
				if (Info.RedirectStandardOutput) Proc.BeginOutputReadLine();
				if (Info.RedirectStandardError)  Proc.BeginErrorReadLine();
				// Tell parent app about the newly spawned process and its PID.
				Pid = Proc.Id;
				// Report back first basic information about the established process.
				var res = new ValueSet();
				res.Add("cid", Cid);
				res.Add("pid", Pid);
				await UWP.Send(res);
			} catch (Exception err) {
				HandleError(err);
			}
		}

		// One time execution, blocking until process closes, reads STDOUT and STDERR at once.
		public async Task Exec() {
			try {
				// Start the process (blocking until it exits) and read all data from STDOUT and STDERR.
				Proc.Start();
				Pid = Proc.Id;
				var res = new ValueSet();
				if (Info.RedirectStandardOutput) res.Add("stdout", Proc.StandardOutput.ReadToEnd());
				if (Info.RedirectStandardError)  res.Add("stderr", Proc.StandardError.ReadToEnd());
				// Synchronously block the task until the process exits.
				Proc.WaitForExit();
				// Report back information about the process.
				res.Add("exitCode", Proc.ExitCode);
				await Report(res);
				// Close the process, release all resources and emit processClosed event.
				Dispose();
			} catch (Exception err) {
				HandleError(err);
			}
		}

		private async void HandleError(Exception err) {
			await ReportError(err.ToString());
			Dispose();
		}

		///////////////////////////////////////////////////////////////////////
		// IN / OUT
		///////////////////////////////////////////////////////////////////////

		// Writes to the process' STDIN or other given named pipe.
		public async void Write(byte[] buffer, int fd = 0) {
			if (fd == 0) {
				// Writes data to STDIN.
				string str = Encoding.UTF8.GetString(buffer, 0, buffer.Length);
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

		private async Task ReportError(object err) {
			ValueSet message = new ValueSet();
			message.Add("error", err);
			await Report(message);
		}

		private async Task Report(ValueSet message) {
			message.Add("cid", Cid);
			if (!Ready.IsCompleted)
				await Ready;
			await UWP.Send(message);
		}


		///////////////////////////////////////////////////////////////////////
		// EVENTS
		///////////////////////////////////////////////////////////////////////

		private async void OnExited(object sender = null, EventArgs e = null) {
			ValueSet message = new ValueSet();
			//message.Add("pid", Pid);
			message.Add("exitCode", Proc.ExitCode);
			await Report(message);
			Dispose();
		}

		// The class has been disposed (and futher attempts to do so within the methods will fail, throw and be caught)
		// but we need to make sure that the pipes and other objects are all cleared of all references to this process.
		private void OnDisposed(object sender = null, object e = null) => Dispose();

		///////////////////////////////////////////////////////////////////////
		// DISPOSE
		///////////////////////////////////////////////////////////////////////

		public void Kill() => Dispose();

		// Closes the process, releases all resources & emits Disposed event.
		public void Dispose() {
			if (Proc == null) return;
			try {
				Proc.Disposed -= OnDisposed;
				Proc.Exited -= OnExited;
				Proc.Close();
				Proc.Dispose();
			} catch { }
			if (Pipes != null) {
				foreach (NamedPipe pipe in Pipes) {
					pipe?.Dispose();
				}
			}
			Disposed?.Invoke();
			Disposed = null;
			Proc = null;
			Info = null;
			Stdio = null;
			Pipes = null;
		}


	}

}
