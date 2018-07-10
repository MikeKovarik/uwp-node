using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using Windows.Foundation.Collections;
using Windows.ApplicationModel;
using Windows.ApplicationModel.Core;
using Windows.ApplicationModel.AppService;


namespace UwpNodeBroker {

	class ChildProcesses {

		static public event Action Change;

		static public List<ChildProcess> Children = new List<ChildProcess>();

		static ChildProcesses() {
			UWP.Request += OnRequest;
		}
		
		// UWP Class safely re-emits RequestReceived as Request event for us to consume and handle.
		// In case of starting a new process, we need to respond to the caller with either the PID of the process
		// or an error thrown while starting it. It is necessary to postpone the response until we the PID
		// and then we can unlock process' ability to communicate to the UWP app as well (the IpcReady task/promise).
		// It is necessary to prevent loss of data read from STDOUT and other pipes which could get ignored if those
		// messages reach UWP app (and gets delayed because of promises and events) before notice of the PID.
		// NOTE: Using dynamic instead of the actual type is ugly but there's no other way around it.
		// Mocking these classes for testing is impossible because all the clases and interfaces in Window.* APIs are
		// either sealed, protected or private and I couldn't find any better solution than just using dynamic.
		//static async void OnRequest(AppServiceRequestReceivedEventArgs e) {
		static async void OnRequest(dynamic e) {
			Console.WriteLine("OnRequest OK");
			ValueSet req = e.Request.Message;
			ValueSet res = new ValueSet();
			// Only command without PID is starting a program.
			var startNew = req.ContainsKey("startProcess");
			if (startNew) {
				var child = StartProcess(req, res);
				// Spawning process takes time, return the task that postpones UWP's reponse.
				await child.Started;
				await e.Request.SendResponseAsync(res);
				child.IpcReady.Start();
			} else if (req.ContainsKey("pid")) {
				try {
					// From now on we deal with exact process.
					// Get PID and Process instance of targetted process.
					var child = GetProcess(req["pid"]);
					if (child == null) return;
					// Handlers
					if (req.ContainsKey("fd") && req.ContainsKey("data")) {
						int.TryParse(req["fd"] as string, out int fd);
						child.Write(req["data"] as byte[], fd);
					} else if (req.ContainsKey("kill")) {
						child.Kill();
					}
				} catch(Exception err) {
					res.Add("error", err.ToString());
				}
				if (res.Count != 0)
					await e.Request.SendResponseAsync(res);
			}

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
