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
		private ValueSet res;
		private Process proc;
		private ProcessStartInfo info;
		private NamedPipe[] pipes;
		private string[] stdio = new string[0];

		public int Pid;
		public Task Ready;
		public event Action Disposed;


		public ChildProcess(ValueSet req, ValueSet res) {
			this.req = req;
			this.res = res;
			Ready = StartProcess();
		}

		private async Task StartProcess() {
			//MessageBox.Show("StartProcess");
			proc = new Process();
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
				Spawn();
			} else {
				// One time execution, blocking until process closes, reads STDOUT and STDERR at once.
				await Task.Run(() => Exec());
			}
		}

		private void SetupInfo() {
			proc.StartInfo = info = new ProcessStartInfo();
			// Create the process without (visible) window.
			info.CreateNoWindow = false;
			info.WindowStyle = ProcessWindowStyle.Hidden;
			info.UseShellExecute = false;
			// Request admin access if needed (prompts UAC dialog)
			//if (req.ContainsKey("admin"))
			//	info.Verb = "runas";
			// Setup what and where to start
			info.FileName = req["program"] as string;
			if (req.ContainsKey("args")) info.Arguments        = req["args"] as string;
			if (req.ContainsKey("cwd"))  info.WorkingDirectory = req["cwd"] as string;
		}

		private void SetupStdio() {
			// Pipes need to be created before the node process even starts
			if (req.ContainsKey("stdio")) {
				stdio = (req["stdio"] as string).Split('|');
				for (int i = 0; i < stdio.Length; i++) {
					// stdio array from js comes in stringified so the nulls have to be tured into proper null again.
					if (stdio[i] == "null" || stdio[i] == "ignore")
						stdio[i] = null;
				}
			} else {
				stdio = new string[0];
			}

			// Request access to STDIO
			if (stdio.Length > 0 && stdio[0] != null) proc.StartInfo.RedirectStandardInput = true;
			if (stdio.Length > 1 && stdio[1] != null) proc.StartInfo.RedirectStandardOutput = true;
			if (stdio.Length > 2 && stdio[2] != null) proc.StartInfo.RedirectStandardError = true;
		}

		private void SetupStdioPipes() {
			// Only long running processes created with spawn() can be communicate asynchronously through custom pipes.
			pipes = new NamedPipe[stdio.Length];
			List<String> pipeNames = new List<String>();
			// Skip the holy trinity of STDIO (IN/OUT/ERR) and start at custom pipes.
			int fd = 3;
			// Few variables used for creation of pipe name.
			var newProcRandomNum = (new Random()).Next(0, 10000); // NOTE: ideally libuv/node would use win32 handle.
			var brokerPid = Process.GetCurrentProcess().Id;
			// Create custom pipes for the other remaining (defined by user) stdio pipes.
			foreach (var type in stdio.Skip(fd)) {
				var name = $"uwp-node\\{newProcRandomNum}-{fd}-{brokerPid}";
				pipeNames.Add(name);
				var pipe = new NamedPipe(name);
				pipe.fd = fd;
				// Handle and report all output and errors of the pipe.
				pipe.Data += (byte[] data) => ReportData(data, pipe.fd);
				pipe.Error += (string err) => ReportError(err, pipe.fd);
				// Pushing null to stream causes it to close and emit 'end' event.
				pipe.End += () => ReportData(null, pipe.fd);
				pipes[fd] = pipe;
				fd++;
			}
			// SIDE-NOTE: Because there's no easy way of creating libuv-style named-pipes that would get picked up by node
			// natively, we have to pass in through env vars custom list of names of pipes that we're creating in C#
			// that JS side of of uwp-node has too bind to.
			info.EnvironmentVariables.Add("uwp-node-stdio-pipes", string.Join("|", pipeNames));
			if (stdio.Contains("ipc")) {
				int ipcFd = Array.FindIndex(stdio, item => item == "ipc");
				info.EnvironmentVariables.Add("uwp-node-stdio-ipc", ipcFd.ToString());
			}
		}

		// Starts the process as long running with asynchronous evented STDIO.
		public void Spawn() {
			try {
				// Handle lifecycle events
				proc.EnableRaisingEvents = true;
				proc.Exited   += OnExited;
				proc.Disposed += OnDisposed;
				// Attach handlers for STDOUT and STDERR
				// NOTE: Once the stream ends, it will call this method with e.Data=null. We then propagate the null to UWP
				// where it naturally ends the stream (uses the same 'stream' library from Node's core)
				if (info.RedirectStandardOutput) proc.OutputDataReceived += (object s, DataReceivedEventArgs e) => ReportData(e.Data, 1);
				if (info.RedirectStandardError)  proc.ErrorDataReceived  += (object s, DataReceivedEventArgs e) => ReportData(e.Data, 2);
				// Start the process and begin receiving data on STDIO streams.
				proc.Start();
				if (info.RedirectStandardOutput) proc.BeginOutputReadLine();
				if (info.RedirectStandardError)  proc.BeginErrorReadLine();
				// Tell parent app about the newly spawned process and its PID.
				Pid = proc.Id;
				res.Add("pid", Pid);
				//MessageBox.Show($"spawned pid {Pid}");
			} catch (Exception err) {
				HandleError(err);
			}
		}

		// One time execution, blocking until process closes, reads STDOUT and STDERR at once.
		public void Exec() {
			try {
				// Start the process (blocking until it exits) and read all data from STDOUT and STDERR.
				proc.Start();
				Pid = proc.Id;
				if (info.RedirectStandardOutput) res.Add("stdout", proc.StandardOutput.ReadToEnd());
				if (info.RedirectStandardError)  res.Add("stderr", proc.StandardError.ReadToEnd());
				// Synchronously block the task until the process exits.
				proc.WaitForExit();
				// Close the process & releases all resources.
				res.Add("exitCode", proc.ExitCode);
				// Release resources and emit processClosed event.
				Dispose();
			} catch (Exception err) {
				HandleError(err);
			}
		}

		private void HandleError(Exception err) {
			MessageBox.Show($"FAIL: {err}");
			res.Add("error", err.ToString());
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
				await proc.StandardInput.WriteAsync(str);
				await proc.StandardInput.FlushAsync();
			} else if (fd > 2) {
				// Writes data to custom named pipes.
				if (pipes.Length < fd && pipes[fd] != null)
					await pipes[fd].Write(buffer);
			}
		}

		private async void ReportData(object data, int fd) {
			ValueSet message = new ValueSet();
			message.Add("pid", Pid);
			message.Add("fd", fd);
			message.Add("data", data);
			await UWP.Send(message);
		}

		private async void ReportError(object err, int fd) {
			ValueSet message = new ValueSet();
			message.Add("pid", Pid);
			message.Add("fd", fd);
			message.Add("error", err);
			await UWP.Send(message);
		}


		///////////////////////////////////////////////////////////////////////
		// EVENTS
		///////////////////////////////////////////////////////////////////////

		private async void OnExited(object sender = null, EventArgs e = null) {
			ValueSet message = new ValueSet();
			message.Add("pid", Pid);
			message.Add("exitCode", proc.ExitCode);
			await UWP.Send(message);
			Dispose();
		}

		private void OnDisposed(object sender = null, EventArgs e = null) {
			// The class has been disposed (and futher attempts to do so within the methods will fail, throw and be caught)
			// but we need to make sure that the pipes and other objects are all cleared of all references to this process.
			Dispose();
		}

		///////////////////////////////////////////////////////////////////////
		// DISPOSE
		///////////////////////////////////////////////////////////////////////

		public void Kill() => Dispose();

		// Closes the process, releases all resources & emits Disposed event.
		public void Dispose() {
			if (proc == null) return;
			try {
				proc.Disposed -= OnDisposed;
				proc.Exited -= OnExited;
				proc.Close();
				proc.Dispose();
			} catch { }
			if (pipes != null) {
				foreach (NamedPipe pipe in pipes) {
					if (pipe != null)
						pipe.Dispose();
				}
			}
			Disposed?.Invoke();
			Disposed = null;
			proc = null;
			info = null;
			stdio = null;
			pipes = null;
		}


	}

}
