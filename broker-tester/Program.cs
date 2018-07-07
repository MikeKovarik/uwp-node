using System;
using Windows.Foundation.Collections;
using UwpNodeBroker;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using System.Windows.Forms;
using System.Threading.Tasks;
using System.Collections.Generic;

namespace UwpNodeBrokerTester {

	class Program {

		static public event Action<byte[]> StdInData;

		[STAThread]
		static void Main() {
			/*
			var json = "{fajny:true, spatny:false, thousand:1000, str:'string', myarray: [1,2,3,4,5,6], prazdny:null}";
			var valueset = ConvertJsonToValueSet(json);
			foreach (var item in valueset) {
				Console.WriteLine($"{item.Key}: {item.Value}");
			}
			*/
			UWP.Init();
			IPC.Init();
			ChildProcesses.Init();
			StartReadingStdin();
			StdInData += OnStdInData;
			Application.Run();
		}

		static void StartReadingStdin() {
			int chunksize = 665536;
			var pipe = Console.OpenStandardInput();
			Task.Run(async () => {
				try {
					byte[] buffer = new byte[chunksize];
					while (pipe.CanRead) {
						int bytesRead = await pipe.ReadAsync(buffer, 0, chunksize);
						if (bytesRead == 0) break;
						byte[] trimmed = new byte[bytesRead];
						Array.Copy(buffer, trimmed, bytesRead);
						StdInData?.Invoke(trimmed);
					}
				} catch (Exception err) {
					Console.WriteLine(err);
				}
			});
		}

		static async void OnStdInData(byte[] buffer) {
			string json = System.Text.Encoding.UTF8.GetString(buffer);
			Console.WriteLine(json);
			var req = ConvertJsonToValueSet(json);
			var res = new ValueSet();
			await UWP.EmitMessage(req, res);
		}

		static public ValueSet ConvertJsonToValueSet(string json) {
			dynamic jo = JObject.Parse(json);
			var valueset = new ValueSet();
			foreach (dynamic item in jo) {
				string name = item.Name;
				var value = item.Value;
				var type = value.GetType().Name;
				switch (type) {
					case "JValue":
						if (value == true) {
							valueset.Add(name, true);
						} else if (value == false) {
							valueset.Add(name, false);
						} else if (value == null) {
							valueset.Add(name, null);
						} else {
							try {
								valueset.Add(name, (int) value);
							} catch {
								try {
									valueset.Add(name, (string) value);
								} catch {
									Console.WriteLine($"WARNING: unhandled JValue: {type} - {name} = {value}");
								}
							}
						}
						break;
					case "JArray":
						byte[] buffer = value.ToObject<byte[]>();
						valueset.Add(name, buffer);
						break;
					default:
						Console.WriteLine($"WARNING: unhandled type: {type} - {name} = {value}");
						break;
				}
			}
			return valueset;
		}

	}

}
