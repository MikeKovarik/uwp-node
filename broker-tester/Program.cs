using System;
using Windows.Foundation.Collections;
using UwpNodeBroker;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using System.Windows.Forms;
using System.Threading.Tasks;
using System.Collections.Generic;
using System.Text;
using System.Linq;

namespace UwpNodeBrokerTester {

	class Program {

		static public event Action<string> Message;

		[STAThread]
		static void Main() {
			UWP.Init();
			IPC.Init();
			ChildProcesses.Init();
			HandleMessages();
			Message += OnMessage;
			Application.Run();
		}

		static void HandleMessages() {
			string temp = "";
			STD.IN += (byte[] buffer) => {
				try {
					temp += Encoding.UTF8.GetString(buffer);
					List<string> messages = temp.Split('\n').ToList();
					var incomplete = messages.Last();
					foreach (string message in messages.Take(messages.Count - 1)) {
						Message?.Invoke(message);
					}
					temp = incomplete;
				} catch { }
			};
		}

		static async void OnMessage(string reqJson) {
			var req = Converters.JsonToValueSet(reqJson);
			var res = new ValueSet();
			await UWP.EmitMessage(req, res);
			var resJson = Converters.ValueSetToJson(res);
			STD.Write(resJson + "\n");
		}

	}


}
