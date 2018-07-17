using Windows.ApplicationModel;
using Windows.ApplicationModel.Core;
using Windows.ApplicationModel.AppService;
using System.Threading.Tasks;
using System.Windows.Forms;
using System;
using System.Collections.Generic;
using System.Linq;
using Windows.Foundation.Collections;


// Package.Current.DisplayName
// Package.Current.Id.FamilyName
// Package.Current.InstalledLocation.Path


namespace UwpNodeBroker {

	class UWP {

		// TODO: handle when the apps reopens but not by this process.
		//       the app would then go on to create new background process, rather than reconnecting to this one.

		// Connection to UWP app
		static public AppServiceConnection connection = null;

		static public bool isConnected {
			get { return connection != null; }
		}

		// Fires when connection to UWP app has been establised.
		// Either right after launch of the background process, or later on when the app is restarted.
		static public event Action Connected;
		// Fires when connection to UWP app has been lost.
		// Usually when the app closes or crashes.
		static public event Action Closed;
		// When UWP app opens.
		static public event Action Opened;
		// When message from UWP (request) is received
		//static public event Action<ValueSet, ValueSet> message;
		static public event Action<ValueSet> Message;

		static public string serviceName = "uwp-node";
		static public string appName;
		static public string appId;
		static public string name;

		static UWP() {
			try {
				appName = Package.Current.DisplayName;
				appId = Package.Current.Id.Name;
			} catch (Exception err) {
				Console.WriteLine("started without UWP indentity");
				appId = "undefined";
			}
			name = $"{serviceName}-{appId}";
			Connect();
		}

		static public async Task Connect() {
			if (UWP.connection != null) return;
			connection = new AppServiceConnection();
			connection.PackageFamilyName = Package.Current.Id.FamilyName;
			connection.AppServiceName = serviceName;
			connection.ServiceClosed += OnServiceClosed;
			connection.RequestReceived += OnMessage;
			var status = await connection.OpenAsync();
			if (status == AppServiceConnectionStatus.Success) {
				Connected?.Invoke();
			} else {
				MessageBox.Show($"Failed to connect {serviceName} background process to UWP App {appId}: {status}");
			}
		}

		static private void OnServiceClosed(AppServiceConnection sender, AppServiceClosedEventArgs args) {
			DisposeConnection();
			Closed?.Invoke();
		}

		static private void DisposeConnection() {
			connection?.Dispose();
			connection = null;
		}

		static public async void OpenApp(object sender = null, EventArgs args = null) {
			IEnumerable<AppListEntry> appListEntries = await Package.Current.GetAppListEntriesAsync();
			await appListEntries.First().LaunchAsync();
			DisposeConnection();
			await Connect();
			Opened?.Invoke();
		}

		static private async void OnMessage(AppServiceConnection sender, AppServiceRequestReceivedEventArgs e) {
			//var messageDeferral = e.GetDeferral();
			// Handle message and let registered handlers do whatever's needed.
			await EmitMessage(e.Request.Message);
			//messageDeferral.Complete();
		}

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
			if (isConnected)
				await connection.SendMessageAsync(valueset);
		}

		static public void Init() { }

	}

}
