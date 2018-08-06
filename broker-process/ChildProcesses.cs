using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using Windows.Foundation.Collections;
using System.IO.Pipes;


// TODO: handle the deferer on incomming message (IPC.appMessage) that calls StartProcess() which is asynchonous task.

namespace UwpNodeBroker {

	class ChildProcesses {

		// Fired when process is killed, exited or new one started.
		static public event Action Change;

		// List of running processes.
		static public List<ChildProcess> Children = new List<ChildProcess>();

		// Named pipe shared between broker and all child processes.
		// Used for IIPC - Internal IPC communication, shielded from user.
		static public NamedPipe iipcPipe = null;

		// Message from child processes
		static public event Action<string, NamedPipeServerStream> Message;

		static ChildProcesses() {
			UWP.Message += OnMessage;
			CreateIipcPipe();
		}
		
		// UWP Class emits Message event and can handle async handlers and await them.
		// This method only returns task when creating new child process which takes some time. We need
		// to postpone response to caller (app behind the UWP class) until we have either PID of the process
		// or error message thrown while spawning the process.
		static void OnMessage(ValueSet req) {
			// Only command without PID is starting a file.
			string cmd = null;
			if (req.ContainsKey("cmd"))
				cmd = req["cmd"] as string;
			if (cmd == "startProcess") {
				var child = StartProcess(req);
			} else if (req.ContainsKey("cid")) {
				// From now on we deal with exact process.
				// Get PID and Process instance of targetted process.
				var child = GetProcess(req);
				if (child == null) return;
				// Handlers
				if (req.ContainsKey("fd") && req.ContainsKey("data")) {
					var fd = Convert.ToInt32(req["fd"]);
					child.Write(req["data"] as byte[], fd);
				} else if (cmd == "kill") {
					child.Kill();
				}
			}
		}

		static public ChildProcess StartProcess(ValueSet req) {
			var child = new ChildProcess(req);
			// Add child to list and remove it when it's disposed.
			Children.Add(child);
			Change?.Invoke();
			child.Disposed += () => {
				var index = Children.IndexOf(child);
				if (Children.Contains(child))
					Children.Remove(child);
				Change?.Invoke();
			};
			return child;
		}

		static public ChildProcess GetProcess(ValueSet req) {
			var cid = Convert.ToInt32(req["cid"]);
			return Children.Find(child => child.Cid == cid);
		}



		static public void CreateIipcPipe() {
			//Console.WriteLine($"C#: {UWP.name}");
			// Create one pipe (and allow creation of up to 1000) for communication with children.
			//iipcPipe = new NamedPipe(UWP.name);
			iipcPipe = new NamedPipe(UWP.name, 250);
			//Console.WriteLine($"C#: CREATED IIPC {UWP.name}");
			string temp = "";
			iipcPipe.Data += (buffer, pipe) => {
				try {
					temp += Encoding.Default.GetString(buffer);
					var messages = temp.Split('\n');
					temp = messages.Last();
					foreach (string message in messages.Take(messages.Length - 1))
						Message?.Invoke(message, pipe);
				} catch { }
			};
		}

		static public async Task Send(string message, NamedPipeServerStream pipe = null) {
			byte[] buffer = Encoding.UTF8.GetBytes(message + "\n");
			await iipcPipe.Write(buffer, pipe);
		}

	}

}
