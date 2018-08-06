using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Windows.Foundation.Collections;
using System.Windows.Forms;
using System.Text;
using System.Diagnostics;


namespace UwpNodeBroker {

	class IPC {

		// TODO: do not pass stdio/pipe related messages down to pipes

		static public void Init() {
			// Try to establish connection between UWP app and this broker process is established.
			// Not awaiting because we're attaching message listeners anyway even if the connection
			// isn't available yet because it might/will be eventually.
			UWP.Connect();
			PassDataBetweenUwpAndChildren();
			HandleLifecycle();
		}

		static private void PassDataBetweenUwpAndChildren() {
			// Pass the IIPC messages from UWP down to child process.
			UWP.Message += async (ValueSet req) => {
				//Console.WriteLine("----- UWP MESSAGE -----");
				//foreach (var pair in req)
				//	Console.WriteLine($"{pair.Key}: {pair.Value}");
				if (req.ContainsKey("iipc")) {
					var cmd = req["iipc"] as string;
					await ChildProcesses.Send(cmd);
				}
			};
			// Receive Internal IPC messages (IIPC) from child's uwp-node.js lib
			// and propagate them to UWP app as well as (potential) other child processes.
			ChildProcesses.Message += (message, pipe) => {
				//Console.WriteLine("----- CHILD MESSAGE -----");
				//Console.WriteLine(message);
				var vs = new ValueSet();
				vs.Add("iipc", message);
				UWP.Send(vs);
				ChildProcesses.Send(message, pipe);
			};
		}

		static private void HandleLifecycle() {
			UWP.Connected += () => ChildProcesses.Send("uwp-connected");
			UWP.Opened += () => ChildProcesses.Send("uwp-opened");
			UWP.Closed += () => ChildProcesses.Send("uwp-closed");
			ChildProcesses.Message += (message, pipe) => {
				if (message.Contains(":")) {
					var sections = message.Split(':');
					OnMessage(sections[0], sections[1]);
				} else {
					OnMessage(message);
				}
			};
		}

		static private void OnMessage(string cmd, object arg = null) {
			switch (cmd) {
				case "uwp-open":
					UWP.Open();
					break;
				// Close cmd will trickle up to the app which will close itself.
				// TODO: use arg argument as a force-close
				case "uwp-close":
					if (arg != null)
						UWP.Close(true);
					break;
			}
		}

		static public void Send(string cmd, string arg) {
			Send(cmd + ":" + arg);
		}

		static public void Send(string message) {
			UWP.Send(message);
			ChildProcesses.Send(message, null);
		}

	}

}
