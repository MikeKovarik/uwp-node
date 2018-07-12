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
		static void OnMessage(ValueSet req) {
			// Only command without PID is starting a program.
			if (req.ContainsKey("startProcess")) {
				var child = StartProcess(req);
			} else if (req.ContainsKey("cid")) {
				// From now on we deal with exact process.
				// Get PID and Process instance of targetted process.
				var child = GetProcess(req);
				if (child == null) return;
				// Handlers
				if (req.ContainsKey("fd") && req.ContainsKey("data")) {
					var fd = (int) req["fd"];
					child.Write(req["data"] as byte[], fd);
				} else if (req.ContainsKey("kill")) {
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
			var cid = (int) req["cid"];
			return Children.Find(child => child.Cid == cid);
		}


		// It's here so we can programatically call static constructor.
		static public void Init() {}

	}

}
