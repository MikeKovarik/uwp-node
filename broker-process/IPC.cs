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

		static IPC() {
			// Ensure connection between UWP app and this broker process is established.
			UWP.Connect();
			//CreateChildProcessPipe();
			int pid = Process.GetCurrentProcess().Id;
			// TODO: actually use it somewhere within broker + propagate it up to the app
			UWP.Message += async (ValueSet req) => {
				//Console.WriteLine("----- UWP MESSAGE -----");
				//foreach (var pair in req)
				//	Console.WriteLine($"{pair.Key}: {pair.Value}");
				if (req.ContainsKey("iipc")) {
					// Pass the message from UWP down to child process.
					var cmd = req["iipc"] as string;
					await ChildProcesses.Send(cmd);
				}
			};

			ChildProcesses.Message += (message, pipe) => {
				//Console.WriteLine("----- CHILD MESSAGE -----");
				//Console.WriteLine(message);
				// Pass the message from child process up to UWP.
				var vs = new ValueSet();
				vs.Add("iipc", message);
				UWP.Send(vs);
				// Redistribution among peer node pocesses.
				ChildProcesses.Send(message, pipe);
			};

			UWP.Connected += () => ChildProcesses.Send("uwp-connected");
			UWP.Closed += () => ChildProcesses.Send("uwp-closed");

		}

		static public void Init() { }

	}

}
