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

		// Internal named pipe shared with child processes.
		static public NamedPipe childIpcPipe = null;

		// Message from child processes
		static public event Action<string> childMessage;

		static IPC() {
			// Ensure connection between UWP app and this broker process is established.
			UWP.Connect();
			//CreateChildProcessPipe();
			int pid = Process.GetCurrentProcess().Id;
			// TODO: actually use it somewhere within broker + propagate it up to the app
			/*
			UWP.message += (ValueSet req, ValueSet res) => {
				res.contains("ipc")
					SendToChildProcesses(req["ipc"] as string)
			};
			childMessage += (byte[] buffer) => {
				// TODO: redistribution among peer node pocesses
				var vs = new ValueSet();
				vs.Add("ipc", buffer);
				SendToUwp(vs);
			};
			UWP.connected += () => IPC.SendToChildProcesses("app-connection");
			UWP.closed += () => IPC.SendToChildProcesses("app-close");
			*/
		}

		static public void CreateChildProcessPipe() {
			// Create one pipe (and allow creation of up to 1000) for communication with children.
			childIpcPipe = new NamedPipe(UWP.name, 1000);
			string temp = "";
			childIpcPipe.Data += (byte[] buffer) => {
				try {
					temp += Encoding.UTF8.GetString(buffer);
					List<string> messages = temp.Split('\n').ToList();
					var incomplete = messages.Last();
					foreach (string message in messages.Take(messages.Count - 1)) {
						childMessage?.Invoke(message);
					}
					temp = incomplete;
				} catch { }
			};
		}

		static public async Task Send(ValueSet valueset) {
			// TODO
			await UWP.Send(valueset);
			//await Task.WhenAll(UWP.Send(valueset), SendToChildProcesses(valueset));
		}

		static public async Task SendToChildProcesses(string json) {
			byte[] buffer = Encoding.UTF8.GetBytes(json + "\n");
			await childIpcPipe.Write(buffer);
		}
		// WARNING: untested. TODO test
		static public async Task SendToChildProcesses(byte[] buffer) {
		    await childIpcPipe.Write(buffer);
			byte[] newLineBuffer = Encoding.UTF8.GetBytes("\n");
		    await childIpcPipe.Write(newLineBuffer);
		}


		static public void Init() { }

	}

}
