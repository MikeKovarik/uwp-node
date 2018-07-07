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

		static public event Action Change;

		static public List<ChildProcess> Children = new List<ChildProcess>();

		static ChildProcesses() {
			UWP.Message += OnMessage;
		}
		
		// UWP Class emits Message event and can handle async handlers and await them.
		// This method only returns task when creating new child process which takes some time. We need
		// to postpone response to caller (app behind the UWP class) until we have either PID of the process
		// or error message thrown while spawning the process.
		static Task OnMessage(ValueSet req, ValueSet res) {
			// Only command without PID is starting a program.
			if (req.ContainsKey("startProcess")) {
				var child = StartProcess(req, res);
				// Spawning process takes time, return the task that postpones UWP's reponse.
				return child.Ready;
			} else if (req.ContainsKey("pid")) {
				// From now on we deal with exact process.
				// Get PID and Process instance of targetted process.
				var child = GetProcess(req["pid"]);
				if (child == null) return null;
				// Handlers
				if (req.ContainsKey("fd") && req.ContainsKey("data")) {
					int.TryParse(req["fd"] as string, out int fd);
					child.Write(req["data"] as byte[], fd);
				} else if (req.ContainsKey("kill")) {
					child.Kill();
				}
			}
			return null;
		}

		static public ChildProcess StartProcess(ValueSet req, ValueSet res) {
			var child = new ChildProcess(req, res);
			// Add child to list and remove it when it's disposed.
			Children.Add(child);
			Change?.Invoke();
			child.Disposed += () => {
				Children.Remove(child);
				Change?.Invoke();
			};
			return child;
		}

		static public ChildProcess GetProcess(object pidArg) {
			int.TryParse(pidArg as string, out int pid);
			return Children.Find(child => child.Pid == pid);
		}


		// It's here so we can programatically call static constructor.
		static public void Init() {}

	}

}
