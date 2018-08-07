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

	class ChildProcess : IDisposable {

		private const int STDIN  = 0;
		private const int STDOUT = 1;
		private const int STDERR = 2;

		private ValueSet req;
		private Process Proc;
		private ProcessStartInfo Info;
		private NamedPipe[] Pipes;
		private string[] Stdio;
		// Semaphore for STDOUT/STDERR.
		// Exited event is in most cases emitted before OutputDataReceived and thus before reading STDIO
		// was finished. Using these Task we can safely run after-exit code once all three Tasks are completed
		private List<Task<object>> StdioTasks;
		private List<TaskCompletionSource<object>> StdioTaskSources;

		public int Cid;
		public bool Killed = false;
		public bool IsDisposed = false;
		public event Action Disposed;


		public ChildProcess(ValueSet req) {
			try {
				this.req = req;
				Proc = new Process();
				// Read custom ID used to identify this process.
				Cid = Convert.ToInt32(req["cid"]);
				// The process could be spawned in long-running mode and non-blockingly listened to - cp.spawn().
				// Or launched and blockingly waited out for exit - cp.exec().
				SetupInfo();
				SetupStdio();
				SetupStdioPipes();
				SetupStdioHandlers();
				// Start the process.
				Spawn();
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
				Stdio = (req["stdio"] as string)
					.Split('|')
					.Select((string name) => {
						// Stdio array from js comes stringified so the nulls have to be tured into proper null again.
						if (name == "null" || name == "ignore") return null;
						return name;
					})
					.ToArray();
			} else {
				Stdio = new string[0];
			}
			// List of kinda lika JS Promises we're using to block emiting 'exit' and exitCode
			// before all stdio streams and pipes are done sending data.
			StdioTaskSources = Stdio
				.Select((name, i) => {
					if (i == 0) return null;
					if (name == null) return null;
					return new TaskCompletionSource<object>();
				})
				.ToList();
			// ... but C# just cannot play nice like JS does and has to have two objects for resolving Task (Promise).
			StdioTasks = StdioTaskSources
				.Select(source => source?.Task)
				.ToList();


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
			// Few variables used for creation of pipe name.
			var brokerPid = Process.GetCurrentProcess().Id;
			// Create custom pipes for the other remaining (defined by user) stdio pipes.
			for (int fd = 3; fd < Stdio.Length; fd++) {
				var name = $"uwp-node\\{Cid}-{fd}-{brokerPid}";
				pipeNames.Add(name);
				var pipe = new NamedPipe(name);
				pipe.fd = fd;
				Pipes[fd] = pipe;
			}
			// SIDE-NOTE: Because there's no easy way of creating libuv-style named-pipes that would get picked up by node
			// natively, we have to pass in through env vars custom list of names of pipes that we're creating in C#
			// that JS side of of uwp-node has too bind to.
			Info.EnvironmentVariables.Add("uwp-node-stdio-pipes", string.Join("|", pipeNames));
			// Internal IPC used for internal uwp-node communications.
			Info.EnvironmentVariables.Add("uwp-node-stdio-iipc", UWP.name);
			if (Stdio.Contains("ipc")) {
				// Classic node's 'ipc' pipe created with cp.spawn().
				int ipcFd = Array.FindIndex(Stdio, item => item == "ipc");
				Info.EnvironmentVariables.Add("uwp-node-stdio-ipc", ipcFd.ToString());
			}
		}

		private void SetupStdioHandlers() {
			// Attach handlers for STDOUT and STDERR
			// NOTE: Once the stream ends, it will call this method with e.Data=null. We then propagate the null to UWP
			// where it naturally ends the stream (uses the same 'stream' library from Node's core)
			if (Info.RedirectStandardOutput) Proc.OutputDataReceived += OnStdout;
			if (Info.RedirectStandardError)  Proc.ErrorDataReceived  += OnStderr;
			foreach (var pipe in Pipes.Skip(3)) {
				// Handle and report all output and errors of the pipe.
				pipe.Data += async (data, p) => await ReportData(data, pipe.fd);
				pipe.Error += async (err, p) => await ReportError(err, pipe.fd);
				// Pushing null to stream causes it to close and emit 'end' event.
				pipe.End += async () => await ReportData(null, pipe.fd);
			}
		}

		private async void OnStdout(object s, DataReceivedEventArgs e) {
			if (e.Data?.Length > 0)
				await ReportData(e.Data + "\n", STDOUT);
			else if (e.Data == null)
				await ReportData(null, STDOUT);
		}

		private async void OnStderr(object s, DataReceivedEventArgs e) {
			if (e.Data?.Length > 0)
				await ReportData(e.Data + "\n", STDERR);
			else if (e.Data == null)
				await ReportData(null, STDERR);
		}

		// This method gets called after exit event when we want to nudge all STDIO to start closing.
		// 1) STDOUT and STDERR should close by barfing null one last time, but from time to time they dont.
		// 2) Named pipes generally collapse on itself. BUT only when user actually uses them in the code
		//    I.E. when he/she imports uwp-node.js in their node code. But if forgotten, the pipe cannot close
		//    because it hasnt even started and connected to anything yet.
		private async void StartClosingStdio() {
			if (IsDisposed) return;
			for (int fd = 3; fd < Pipes.Length; fd++) {
				var pipe = Pipes[fd];
				if (pipe == null) continue;
				if (pipe.Connected) continue;
				pipe.Dispose();
			}
			await Task.Delay(500);
			if (IsDisposed) return;
			// Making sure the STDOUT and STDERR emit null.
			// This will unlock the onexited semaphore/task which will lead to disposal.
			if (Info.RedirectStandardOutput && !StdioTasks[1].IsCompleted)
				ReportData(null, STDOUT);
			if (Info.RedirectStandardError && !StdioTasks[2].IsCompleted)
				ReportData(null, STDERR);
		}

		// Starts the process as long running with asynchronous evented STDIO.
		public async void Spawn() {
			try {
				// Handle lifecycle events
				Proc.EnableRaisingEvents = true;
				// Resolves one of the exitCode and 'exit' event blocking semaphore/Task/Promises.
				Proc.Exited += OnExit;
				// Start the process and begin receiving data on STDIO streams.
				Proc.Start();
				if (Info.RedirectStandardOutput) Proc.BeginOutputReadLine();
				if (Info.RedirectStandardError)  Proc.BeginErrorReadLine();
				// Report back first basic information about the established process.
				await Report("pid", Proc.Id);
				// This should ensure that STDOUT and STDERR are flushed and EOF'd after exit. 
				Proc.WaitForExit();
			} catch (Exception err) {
				HandleError(err);
			}
		}

		public async void OnExit(object s, object e) {
			// Force closure of STDOUT & STDERR and named pipes if they aren't closed in a reasonable while.
			StartClosingStdio();
			await Task.WhenAll(StdioTasks.Where(task => task != null));
			// We can now safely report exit code and dispose the process and all references.
			if (Killed) {
				// Node processes treat killed processes with null exit code as opposed to C# which uses -1.
				await Report("exitCode", null);
			} else {
				try {
					await Report("exitCode", Proc.ExitCode);
				} catch {
					// general error
					await Report("exitCode", 1);
				}
			}
			// Kill it with fire.
			Dispose();
		}

		private async void HandleError(Exception err) {
			switch (err.Message) {
				case "The system cannot find the file specified":
					await Report("exitCode", -4058); // ENOENT
					break;
				default:
					await ReportError(err.Message, err.StackTrace);
					// TODO: should the process be killed?
					// TODO: more research and testing.
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
			} else if (fd > 2 && fd < Pipes.Length) {
				// Writes data to custom named pipes.
				await Pipes[fd]?.Write(buffer);
			}
		}

		private async Task ReportData(object data, int fd) {
			ValueSet message = new ValueSet();
			message.Add("fd", fd);
			message.Add("data", data);
			await Report(message);
			if (data == null)
				StdioTaskSources[fd].TrySetResult(null);
		}

		private async Task ReportError(object err, int fd) {
			ValueSet message = new ValueSet();
			message.Add("fd", fd);
			message.Add("error", err);
			await Report(message);
			StdioTaskSources[fd].TrySetResult(null);
		}

		private async Task ReportError(string err, string stack) {
			ValueSet message = new ValueSet();
			message.Add("error", err);
			message.Add("stack", stack);
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
			//Console.WriteLine("Kill");
			Killed = true;
			try {
				if (!Proc.HasExited)
					Proc.Kill();
			} catch {
				Dispose();
			}
		}

		// Closes the process, releases all resources & emits Disposed event.
		public void Dispose() {
			if (IsDisposed == true) return;
			IsDisposed = true;
			Proc.Exited -= OnExit;
			if (Info.RedirectStandardOutput) Proc.OutputDataReceived -= OnStdout;
			if (Info.RedirectStandardError)  Proc.ErrorDataReceived  -= OnStderr;
			try {
				Proc.Close();
				Proc.Dispose();
			} catch {}
			foreach (NamedPipe pipe in Pipes)
				pipe?.Dispose();
			StdioTasks.Clear();
			StdioTaskSources.Clear();
			if (Disposed != null) {
				Disposed.Invoke();
				foreach (var listener in Disposed.GetInvocationList())
					Disposed -= (Action) listener;
			}
		}


	}

}
