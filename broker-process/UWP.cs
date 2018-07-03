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

		static public string serviceName = "uwp-node";
		static public string appName = Package.Current.DisplayName;
		static public string name = $"{serviceName}-{appName}";

		// Connection to UWP app
		static public AppServiceConnection connection = null;

		static public bool isConnected {
			get { return connection != null; }
		}

		// Fires when connection to UWP app has been establised.
		// Either right after launch of the background process, or later on when the app is restarted.
		static public event Action connected;
		// Fires when connection to UWP app has been lost.
		// Usually when the app closes or crashes.
		static public event Action closed;
		// When UWP app opens.
		static public event Action opened;
		// When message from UWP (request) is received
		//static public event Action<ValueSet, ValueSet> message;
		static public event Func<ValueSet, ValueSet, Task> message;

		static UWP() {
			Connect();
		}

		static public async Task Connect() {
			if (connection != null) return;
			connection = new AppServiceConnection();
			connection.PackageFamilyName = Package.Current.Id.FamilyName;
			connection.AppServiceName = serviceName;
			connection.ServiceClosed += OnServiceClosed;
			connection.RequestReceived += OnMessage;
			AppServiceConnectionStatus status = await connection.OpenAsync();
			if (status == AppServiceConnectionStatus.Success) {
				connected?.Invoke();
			} else {
				MessageBox.Show($"Failed to connect {serviceName} background process to UWP App {appName}: {status}");
			}
		}

		static private void OnServiceClosed(AppServiceConnection sender, AppServiceClosedEventArgs args) {
			DisposeConnection();
			closed?.Invoke();
		}

		static private void DisposeConnection() {
			if (connection == null) return;
			try {
				connection.Dispose();
			} finally {
				connection = null;
			}
		}

		static public async void OpenApp(object sender = null, EventArgs args = null) {
			IEnumerable<AppListEntry> appListEntries = await Package.Current.GetAppListEntriesAsync();
			await appListEntries.First().LaunchAsync();
			DisposeConnection();
			await Connect();
			opened?.Invoke();
		}

		static private async void OnMessage(AppServiceConnection sender, AppServiceRequestReceivedEventArgs e) {
			//MessageBox.Show("OnRequestReceived"); // TODO: delete
			var messageDeferral = e.GetDeferral();
			// Handle message and let registered handlers do whatever's needed.
			ValueSet req = e.Request.Message;
			ValueSet res = new ValueSet();
			try {
				//message?.Invoke(req, res);
				if (message != null) {
					Task[] tasks = message.GetInvocationList()
						.Select(handler => ((Func<ValueSet, ValueSet, Task>)handler)(req, res))
						.ToArray();
					//MessageBox.Show("before await");
					await Task.WhenAll(tasks);
					MessageBox.Show("after await");
				}
			} catch (Exception err) {
				res.Add("OnMessage error", err.ToString());
			}
			//MessageBox.Show("responding to UWP");
			await e.Request.SendResponseAsync(res);
			//MessageBox.Show("responded to UWP");
			// Complete the deferral so that the platform knows that we're done responding to the app service call.
			// Note for error handling: this must be called even if SendResponseAsync() throws an exception.
			messageDeferral.Complete();
		}

		static public async Task Send(ValueSet valueset) {
			if (isConnected)
				await connection.SendMessageAsync(valueset);
		}

		static public void Init() { }

	}

}
