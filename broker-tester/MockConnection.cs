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

	// NOTE: This isn't exact 1:1 mock of UWP's class. The RequestReceived event is bypassed and handled
	// in custom manner to simplify code and prevent the necessity to have all handlers dynamic in UWP code.
	// It leads to tightly coupled mock code, but more efficient production code.
	class MockConnection {

		private NamedPipe pipe;
		private string jsonBuffer = "";

		public MockConnection() {
			var pipeId = (new Random()).Next(0, 10000);
			var pipeName = $"uwp-node-broker-tester-{pipeId}";
			pipe = new NamedPipe(pipeName);
			pipe.Data += OnBytes;
			Console.WriteLine($"CREATED IPC PIPE: {pipeName}"); // DO NOT DELETE
		}

		private void OnBytes(byte[] buffer) {
			try {
				jsonBuffer += Encoding.UTF8.GetString(buffer);
				List<string> messages = jsonBuffer.Split('\n').ToList();
				var incomplete = messages.Last();
				foreach (string message in messages.Take(messages.Count - 1)) {
					OnJson(message);
				}
				jsonBuffer = incomplete;
			} catch { }
		}

		private async void OnJson(string reqJson) {
			//Console.WriteLine($"OnJson {reqJson}");
			var req = Converters.JsonToValueSet(reqJson);
			//DebugValueSet(req);
			var res = new ValueSet();
			// UWP messages have roundtrip with response that can be delayed. This is not possible
			// in purely evented IO and we have to sign the messages with some message ID.
			if (req.ContainsKey("mockReqId")) {
				res["mockReqId"] = (int)req["mockReqId"];
			}
			// Publish the message as if it was from UWP.
			await UWP.EmitMessage(req, res);
			//Console.WriteLine("AWAITED");
			await SendMessageAsync(res);
		}

		private void DebugValueSet(ValueSet valueset) {
			Console.WriteLine("----------------------------------");
			foreach (var item in valueset) {
				Console.WriteLine($"{item.Key} : {item.Value}");
			}
			Console.WriteLine("----------------------------------");
		}

		public async Task SendMessageAsync(ValueSet valueset) {
			var json = Converters.ValueSetToJson(valueset);
			await pipe.Write(json + "\n");
			//Console.WriteLine("SENT TO UWP");
		}

		public void Dispose() {
			pipe.Dispose();
		}

	}

}
