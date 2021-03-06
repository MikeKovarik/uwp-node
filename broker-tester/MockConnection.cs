﻿using System;
using Windows.Foundation.Collections;
using UwpNodeBroker;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using System.Windows.Forms;
using System.Threading.Tasks;
using System.Collections.Generic;
using System.Text;
using System.Linq;
using System.IO.Pipes;


namespace UwpNodeBroker {

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
			//pipe.Data += OnBytes;
			Console.WriteLine($"CREATED IPC PIPE: {pipeName}"); // DO NOT DELETE
		}

		private void OnBytes(byte[] buffer, NamedPipeServerStream p) {
			try {
				jsonBuffer += Encoding.Default.GetString(buffer);
				List<string> messages = jsonBuffer.Split('\n').ToList();
				jsonBuffer = messages.Last();
				foreach (string message in messages.Take(messages.Count - 1)) {
					OnJson(message);
				}
			} catch { }
		}

		private async void OnJson(string reqJson) {
			//Console.WriteLine($"### OnJson {reqJson}");
			var req = Converters.JsonToValueSet(reqJson);
			// Publish the message as if it was from UWP.
			await UWP.EmitMessage(req);
		}

		private void DebugValueSet(ValueSet valueset) {
			Console.WriteLine("----------------------------------");
			foreach (var item in valueset) {
				Console.WriteLine($"{item.Key} : {item.Value} {item.Value?.GetType().Name}");
			}
			Console.WriteLine("----------------------------------");
		}

		public async Task SendMessageAsync(ValueSet valueset) {
			//DebugValueSet(valueset);
			var json = Converters.ValueSetToJson(valueset);
			//Console.WriteLine($"> SEND {json}");
			await pipe.Write(json + "\n");
			//Console.WriteLine($"> SENT {json}");
		}

		public void Dispose() {
			pipe.Dispose();
		}

	}

}
