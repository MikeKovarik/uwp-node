using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using Windows.Foundation.Collections;


namespace UwpNodeBroker {
	class UWP {

		static public bool isConnected {
			get { return connection != null; }
		}

		static public MockAppServiceConnection connection = null;
		static public event Action Connected;
		static public event Action Closed;
		static public event Action Opened;
		static public event Action<ValueSet> Message;
		static public string serviceName = "uwp-node";
		static public string appName = "undefined";
		static public string appId = "undefined";
		static public string name = "uwp-node-tester";

		static UWP() {
			connection = new MockAppServiceConnection();
		}

		static public async Task Connect() {}

		static public async void Open(object sender = null, EventArgs args = null) {}

		static public async void Close(bool force = false) {}

		static public async Task EmitMessage(ValueSet message) {
			try {
				Message?.Invoke(message);
			} catch (Exception err) {
				var vs = new ValueSet();
				vs.Add("error", err.ToString());
				await Send(vs);
			}
		}

		static public async Task Send(ValueSet valueset) {
			if (!isConnected) return;
			await connection.SendMessageAsync(valueset);
		}

		static public async Task Send(string message) {
			if (!isConnected) return;
			var valueset = new ValueSet();
			valueset.Add("iipc", message);
			await connection.SendMessageAsync(valueset);
		}

	}
}
