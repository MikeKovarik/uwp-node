using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using Windows.Foundation.Collections;


// TODO: handle the deferer on incomming message (IPC.appMessage) that calls StartProcess() which is asynchonous task.

namespace UwpNodeBroker {

	class ChildProcesses {

		// TODO: investigate if closing and disposing process and named pipes releases lambda event handlers
		// or if those need to be removed to prevent memory leaks.


		static public event Action<Process> processStarted;
		static public event Action processClosed;

		static public Dictionary<int, Process> processes = new Dictionary<int, Process>();
		static public Dictionary<Process, NamedPipe[]> pipes = new Dictionary<Process, NamedPipe[]>();

		static ChildProcesses() {
			UWP.message += OnMessage;
		}
		
		static async Task OnMessage(ValueSet req, ValueSet res) {
			// Only command without PID is starting a program.
			if (req.ContainsKey("startProcess")) {
				await StartProcess(req, res);
				//MessageBox.Show("PROCESS DONE");
				return;
			}
			// From now on we deal with exact process.
			if (!req.ContainsKey("pid"))
				return;
			// Get PID and Process instance of targetted process.
			int.TryParse(req["pid"] as string, out int pid);
			processes.TryGetValue(pid, out Process proc);
			// Handlers
			if (req.ContainsKey("kill")) {
				Kill(pid, req["kill"] as string);
				return;
			}
			if (req.ContainsKey("fd") && req.ContainsKey("data")) {
				int.TryParse(req["fd"] as string, out int fd);
				Write(proc, fd, req["data"] as byte[]);
				return;
			}
		}

		static public Task StartProcess(ValueSet req, ValueSet res) {
			//MessageBox.Show("StartProcess");
			Process proc = new Process();
			// The process could be spawned in long-running mode and non-blockingly listened to - cp.spawn().
			// Or launched and blockingly waited out for exit - cp.exec().
			var isLongRunning = req["startProcess"] as string == "spawn";
			try {
				proc.StartInfo = SetupProcessInfo(req);
				SetupProcessStdio(req, proc, isLongRunning);
			} catch (Exception err) {
				HandleError(res, proc, err);
			}
			// Start the process.
			if (isLongRunning) {
				// Long running with asynchronous evented STDIO.
				SpawnProcess(res, proc);
			} else {
				// One time execution, blocking until process closes, reads STDOUT and STDERR at once.
				return Task.Run(() => ExecProcess(res, proc));
			}
			//MessageBox.Show("StartProcess success end");
			return null;
		}

		static private ProcessStartInfo SetupProcessInfo(ValueSet req) {
			var info = new ProcessStartInfo();
			// The process could be spawned in long-running mode and non-blockingly listened to - cp.spawn().
			// Or launched and blockingly waited out for exit - cp.exec().

			// Create the process without (visible) window.
			info.CreateNoWindow = false;
			info.WindowStyle = ProcessWindowStyle.Hidden;
			info.UseShellExecute = false;
			// Request admin access if needed (prompts UAC dialog)
			//if (req.ContainsKey("admin"))
			//	info.Verb = "runas";

			// Setup what and where to start
			info.FileName = req["program"] as string;
			if (req.ContainsKey("args")) info.Arguments = req["args"] as string;
			if (req.ContainsKey("cwd")) info.WorkingDirectory = req["cwd"] as string;

			return info;
		}

		static private string[] ParseStdio(ValueSet req) {
			if (req.ContainsKey("stdio")) {
				string[] stdio = (req["stdio"] as string).Split(',');
				for (int i = 0; i < stdio.Length; i++) {
					// stdio array from js comes in stringified so the nulls have to be tured into proper null again.
					if (stdio[i] == "null" || stdio[i] == "ignore")
						stdio[i] = null;
				}
				return stdio;
			} else {
				return new string[0];
			}
		}

		static private void SetupProcessStdio(ValueSet req, Process proc, bool isLongRunning) {
			// Pipes need to be created before the node process even starts
			string[] stdio = ParseStdio(req);

			// Request access to STDIO
			if (stdio.Length > 0 && stdio[0] != null) proc.StartInfo.RedirectStandardInput = true;
			if (stdio.Length > 1 && stdio[1] != null) proc.StartInfo.RedirectStandardOutput = true;
			if (stdio.Length > 2 && stdio[2] != null) proc.StartInfo.RedirectStandardError = true;

			// Only long running processes created with spawn() can be communicate asynchronously through custom pipes.
			if (isLongRunning) {
				NamedPipe[] procPipes = new NamedPipe[stdio.Length];
				// Skip the holy trinity of STDIO (IN/OUT/ERR) and start at custom pipes.
				int fd = 3;
				// Few variables used for creation of pipe name.
				var newProcRandomNum = (new Random()).Next(0, 10000); // NOTE: ideally libuv/node would use win32 handle.
				var brokerPid = Process.GetCurrentProcess().Id;
				// Create custom pipes for the other remaining (defined by user) stdio pipes.
				foreach (var type in stdio.Skip(fd)) {
					var name = $"${newProcRandomNum}-{fd}-{brokerPid}";
					var pipe = new NamedPipe(name);
					pipe.fd = fd;
					// Handle and report all output and errors of the pipe.
					pipe.data += (byte[] data) => ReportData(proc, pipe.fd, data);
					pipe.error += (string err) => ReportError(proc, pipe.fd, err);
					// Pushing null to stream causes it to close and emit 'end' event.
					pipe.end += () => ReportData(proc, pipe.fd, null);
					procPipes[fd] = pipe;
					fd++;
				}
				pipes.Add(proc, procPipes);
			}
		}

		static public void SpawnProcess(ValueSet res, Process proc) {
			try {
				var info = proc.StartInfo;
				// Handle lifecycle events
				proc.EnableRaisingEvents = true;
				proc.Exited += OnExited;
				proc.Disposed += OnDisposed;
				// Attach handlers for STDOUT and STDERR
				// NOTE: Once the stream ends, it will call this method with e.Data=null. We then propagate the null to UWP
				// where it naturally ends the stream (uses the same 'stream' library from Node's core)
				if (info.RedirectStandardOutput) proc.OutputDataReceived += (object s, DataReceivedEventArgs e) => ReportData(proc, 1, e.Data);
				if (info.RedirectStandardError)  proc.ErrorDataReceived  += (object s, DataReceivedEventArgs e) => ReportData(proc, 2, e.Data);
				// Start the process and begin receiving data on STDIO streams.
				proc.Start();
				if (info.RedirectStandardOutput) proc.BeginOutputReadLine();
				if (info.RedirectStandardError)  proc.BeginErrorReadLine();
				// Store references to this process and emit processStarted event.
				Store(proc);
				// Tell parent app about the newly spawned process and its PID.
				res.Add("pid", proc.Id);
				//MessageBox.Show($"spawned pid {proc.Id}");
			} catch (Exception err) {
				HandleError(res, proc, err);
			}
		}

		static public void ExecProcess(ValueSet res, Process proc) {
			try {
				var info = proc.StartInfo;
				// Start the process (blocking until it exits) and read all data from STDOUT and STDERR.
				proc.Start();
				Store(proc); // TODO test if this gets called of if Start is blocking as well.
				if (info.RedirectStandardOutput) res.Add("stdout", proc.StandardOutput.ReadToEnd());
				if (info.RedirectStandardError)  res.Add("stderr", proc.StandardError.ReadToEnd());
				// Synchronously block the task until the process exits.
				proc.WaitForExit();
				// Close the process & releases all resources.
				res.Add("exitCode", proc.ExitCode);
				// Release resources and emit processClosed event.
				Dispose(proc);
			} catch (Exception err) {
				HandleError(res, proc, err);
			}
		}

		static private void Store(Process proc) {
			// Store references to this process.
			processes.Add(proc.Id, proc);
			// Emit event.
			processStarted?.Invoke(proc);
		}



		static public Process GetProcess(int pid) {
			// Try to get stored process, or get it from OS if it for some reason isn't in the list.
			if (processes.TryGetValue(pid, out Process proc))
				return proc;
			else
				return Process.GetProcessById(pid);
		}

		static public void Kill(int pid, string signal = null) {
			Kill(GetProcess(pid), signal);
		}

		static public void Kill(Process proc, string signal = null) {
			// todo. kill with signal
			if (proc == null) return;
			Dispose(proc);
		}


		static private void HandleError(ValueSet res, Process proc, Exception err) {
			MessageBox.Show($"FAIL: {err}");
			// TODO: test and make sure this message still gets sent
			// becase this methods is not a Task.
			res.Add("error", err.ToString());
			// TODO: Investigate and refactor if possible given the OnDisposed event.
			Dispose(proc);
		}

		static private async void OnExited(object sender = null, EventArgs e = null) {
			Process proc = sender as Process;
			//MessageBox.Show($"OnExited {proc.Id}: {proc.ExitCode}");
			ValueSet message = new ValueSet();
			message.Add("pid", proc.Id);
			message.Add("exitCode", proc.ExitCode);
			await UWP.Send(message);
			Dispose(proc);
		}

		// TODO: this event might lead to simplification in the other dispose methods and how
		// they're intertwined. Investigate and refactor if possible.
		static private void OnDisposed(object sender = null, EventArgs e = null) {
			Process proc = sender as Process;
			// The class has been disposed (and futher attempts to do so within the methods will fail, throw and be caught)
			// but we need to make sure that the processes and procPipes lists are all cleared of all references to this process.
			Dispose(proc);
		}

		// Closes the process & releases all resources.
		// TODO: Investigate and refactor if possible given the OnDisposed event.
		static public void Dispose(Process proc) {
			//MessageBox.Show("Dispose");
			if (proc == null) return;
			DisposePipes(proc);
			DisposeProcess(proc);
			// Emit event.
			processClosed?.Invoke();
		}

		// Closes the process & releases all resources held in the launcher.
		// TODO: Investigate and refactor if possible given the OnDisposed event.
		static private void DisposeProcess(Process proc) {
			//MessageBox.Show("DisposeProcess");
			if (proc == null) return;
			// Remove it from process list if it is listed and if it has PID (might fail if crashed before start).
			try {
				if (processes.ContainsKey(proc.Id))
					processes.Remove(proc.Id);
			} catch { }
			// Dispose the process.
			try {
				proc.Close();
				proc.Dispose();
			} catch { }
		}

		// Closes process' pipes & releases all resources held in the launcher.
		// TODO: Investigate and refactor if possible given the OnDisposed event.
		static private void DisposePipes(Process proc) {
			//MessageBox.Show("DisposePipes");
			if (pipes.TryGetValue(proc, out var procPipes)) {
				DisposePipes(procPipes);
				pipes.Remove(proc);
			}
		}

		static private void DisposePipes(NamedPipe[] procPipes) {
			//MessageBox.Show("DisposePipes");
			if (procPipes == null) return;
			foreach (NamedPipe pipe in procPipes) {
				if (pipe != null)
					pipe.Close();
			}
		}

		// Writes to the process' STDIN or other given named pipe.
		static public async void Write(Process proc, int fd, byte[] buffer) {
			if (fd == 0) {
				// Writes data to STDIN.
				string str = Encoding.UTF8.GetString(buffer, 0, buffer.Length);
				await proc.StandardInput.WriteAsync(str);
				await proc.StandardInput.FlushAsync();
			} else if (fd > 2) {
				// Writes data to custom named pipes.
				if (pipes.TryGetValue(proc, out var procPipes)) {
					var pipe = procPipes[fd];
					if (pipe != null)
						await pipe.Write(buffer);
				}
			}
		}

		static private async void ReportData(object proc, int fd, object data) {
			ValueSet message = new ValueSet();
			message.Add("pid", (proc as Process).Id);
			message.Add("fd", fd);
			message.Add("data", data);
			await UWP.Send(message);
		}

		static private async void ReportError(object proc, int fd, object err) {
			ValueSet message = new ValueSet();
			message.Add("pid", (proc as Process).Id);
			message.Add("fd", fd);
			message.Add("error", err);
			await UWP.Send(message);
		}


		static public void Init() {}

	}

}
