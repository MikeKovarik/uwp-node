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

	class Mock {
		static public MockAppServiceConnection connection = new MockAppServiceConnection();
	}

	// NOTE: This isn't exact 1:1 mock of UWP's class. The RequestReceived event is bypassed and handled
	// in custom manner to simplify code and prevent the necessity to have all handlers dynamic in UWP code.
	// It leads to tightly coupled mock code, but more efficient production code.
	class MockAppServiceConnection {

		private NamedPipe pipe;
		private string jsonBuffer = "";

		public MockAppServiceConnection() {
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
			var e = new MockAppServiceRequestReceivedEventArgs();
			e.Request.Message = req;
			UWP.EmitRequest(null, e);
		}

		private void DebugValueSet(ValueSet valueset) {
			Console.WriteLine("----------------------------------");
			foreach (var item in valueset) {
				Console.WriteLine($"{item.Key} : {item.Value}");
			}
			Console.WriteLine("----------------------------------");
		}

		public async Task SendMessageAsync(ValueSet valueset) {
			//DebugValueSet(valueset);
			var json = Converters.ValueSetToJson(valueset);
			await pipe.Write(json + "\n");
			Console.WriteLine($"SENT {json}");
			//Console.WriteLine("SENT TO UWP");
		}

		public void Dispose() {
			pipe.Dispose();
		}

	}


	class MockAppServiceDeferral {
		public void Complete() {}
	}


	class MockAppServiceRequestReceivedEventArgs {
		public MockAppServiceRequest Request = new MockAppServiceRequest();
		public object GetDeferral() {
			return new MockAppServiceDeferral();
		}
	}


	class MockAppServiceRequest {
		public ValueSet Message;
		public async Task SendResponseAsync(ValueSet res) {
			Console.WriteLine("send response");
			var req = Message;
			if (req.ContainsKey("mockReqId")) {
				res["mockReqId"] = (int)req["mockReqId"];
			}
			Mock.connection.SendMessageAsync(res);
			// TODO: send
		}
	}

}
