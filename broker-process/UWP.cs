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
		// NOTE: It has to be dynamic to enable mocking during testing.
		static public dynamic connection = null;
		//static public AppServiceConnection connection = null;

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
		static public event Func<ValueSet, ValueSet, Task> Message;

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
			AppServiceConnection connection = UWP.connection = new AppServiceConnection();
			connection.PackageFamilyName = Package.Current.Id.FamilyName;
			connection.AppServiceName = serviceName;
			connection.ServiceClosed += OnServiceClosed;
			connection.RequestReceived += OnMessage;
			AppServiceConnectionStatus status = await connection.OpenAsync();
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
			//MessageBox.Show("OnRequestReceived"); // TODO: delete
			var messageDeferral = e.GetDeferral();
			// Handle message and let registered handlers do whatever's needed.
			ValueSet req = e.Request.Message;
			ValueSet res = new ValueSet();
			await EmitMessage(req, res);
			//MessageBox.Show("responding to UWP");
			await e.Request.SendResponseAsync(res);
			//MessageBox.Show("responded to UWP");
			// Complete the deferral so that the platform knows that we're done responding to the app service call.
			// Note for error handling: this must be called even if SendResponseAsync() throws an exception.
			messageDeferral.Complete();
		}

		static public async Task EmitMessage(ValueSet req, ValueSet res) {
			try {
				if (Message != null) {
					// Emit Message event and await until handler's tasks are done.
					Task[] tasks = Message
						.GetInvocationList()
						.Select(handler => ((Func<ValueSet, ValueSet, Task>)handler)(req, res))
						.Where(task => task != null)
						.ToArray();
					await Task.WhenAll(tasks);
				}
			} catch (Exception err) {
				res.Add("error", err.ToString());
			}
		}

		static public async Task Send(ValueSet valueset) {
			if (isConnected)
				await connection.SendMessageAsync(valueset);
		}

		static public void Init() { }

	}

}
