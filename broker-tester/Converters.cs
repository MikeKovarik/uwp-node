using System;
using Windows.Foundation.Collections;
using UwpNodeBroker;
using Newtonsoft.Json.Linq;
using Newtonsoft.Json;

namespace UwpNodeBrokerTester {

	class Converters {
		
		// NOTE: no need to do thorough conversion because ValueSet only supports
		// number/int, string, null, bool, and Uint8Array/byte[]
		static public ValueSet JsonToValueSet(string json) {
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
								valueset.Add(name, (int)value);
							} catch {
								try {
									valueset.Add(name, (string)value);
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

		static public string ValueSetToJson(ValueSet valueset) {
			JObject jo = new JObject();
			foreach (var item in valueset) {
				if (item.Value == null) {
					jo.Add(item.Key, null);
				} else {
					if (item.Value?.GetType() == typeof(byte[])) {
						JArray ja = new JArray();
						foreach (byte b in item.Value as byte[])
							ja.Add(b);
						Console.WriteLine("TODO convert buffer to array");
						jo.Add(item.Key, JToken.FromObject(ja));
					} else {
						jo.Add(item.Key, JToken.FromObject(item.Value));
					}
				}
			}
			return jo.ToString(Formatting.None);
		}

	}

}
