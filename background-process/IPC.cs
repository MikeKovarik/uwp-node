using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Windows.ApplicationModel;
using Windows.ApplicationModel.Core;
using Windows.ApplicationModel.AppService;
using Windows.Foundation.Collections;
using System.Windows.Forms;
using System.IO;
using System.IO.Pipes;
using System.Text;
using System.Diagnostics;
using System;
using System.Threading.Tasks;
using Windows.ApplicationModel.Activation;
using Windows.ApplicationModel.AppService;
using Windows.ApplicationModel.Background;
using Windows.ApplicationModel.Core;
using Windows.Foundation;
using Windows.Foundation.Collections;
using Windows.Foundation.Metadata;
using Windows.UI.Core;
using Windows.UI.Popups;
using System.Management;


// Package.Current.DisplayName
// Package.Current.Id.FamilyName
// Package.Current.InstalledLocation.Path

namespace BackgroundProcess {

    class IPC {
		// TODO: handle when the apps reopens but not by this process.
		//       the app would then go on to create new background process, rather than reconnecting to this one.
		// TODO: do not pass stdio/pipe related messages down to pipes

		static public string serviceName = "uwp-node";
		static public string appName = Package.Current.DisplayName;
		static public string mutexName = $"{serviceName}-{appName}-mutex";

		// Connection to UWP app
		static public AppServiceConnection connection = null;
		// Internal named pipe shared with child processes.
        static public NamedPipe pipe = null;

		// TODO: API for setting this
		// Default setting: BG process is kept alive if child processes are running (when the app closes).
		// BG and child processes will be killed if set to false.
		static public bool keepAlive = true;
		// TODO
		static public bool isUwpAppRunning {
			get { return connection != null; }
		}

		// Fires when connection to UWP app has been establised.
		// Either right after launch of the background process, or later on when the app is restarted.
		static public event Action appConnection;
		// Fires when connection to UWP app has been lost.
		// Usually when the app closes or crashes.
		static public event Action appClose;
		// Message from UWP (request)
		static public event Action<ValueSet, ValueSet> appMessage;
		// Message from child processes
		static public event Action<string> childMessage;

		static IPC() {
            ConnectToUwp();
            //CreateChildProcessPipe();
            int pid = Process.GetCurrentProcess().Id;
		}

		static public void CreateChildProcessPipe() {
			pipe = new NamedPipe(serviceName, 100);
			string temp = "";
			pipe.data += (byte[] buffer) => {
				try {
					temp += Encoding.UTF8.GetString(buffer);
					List<string> messages = temp.Split('\n').ToList();
					var incomplete = messages.Last();
					foreach (string message in messages.Take(messages.Count - 1)) {
						childMessage?.Invoke(message);
					}
					temp = incomplete;
				} catch { }
			};
		}

        static public async Task ConnectToUwp() {
            if (connection != null) return;
            connection = new AppServiceConnection();
            connection.PackageFamilyName = Package.Current.Id.FamilyName;
            connection.AppServiceName = serviceName;
            connection.ServiceClosed += OnServiceClosed;
            connection.RequestReceived += OnUwpMessage;
            AppServiceConnectionStatus status = await connection.OpenAsync();
			if (status == AppServiceConnectionStatus.Success) {
				appConnection?.Invoke();
			} else {
                MessageBox.Show($"Failed to connect {serviceName} background process to UWP App {appName}: {status}");
			}
		}

		static void DestroyUwpConnection() {
			if (connection == null) return;
			try {
				connection.Dispose();
			} finally {
				connection = null;
			}
		}

        static public async void OpenUwpApp(object sender = null, EventArgs args = null) {
            IEnumerable<AppListEntry> appListEntries = await Package.Current.GetAppListEntriesAsync();
            await appListEntries.First().LaunchAsync();
			DestroyUwpConnection();
			await ConnectToUwp();
        }

        static private void OnServiceClosed(AppServiceConnection sender, AppServiceClosedEventArgs args) {
			DestroyUwpConnection();
			appClose?.Invoke();
        }

        static private async void OnUwpMessage(AppServiceConnection sender, AppServiceRequestReceivedEventArgs e) {
            MessageBox.Show("OnRequestReceived"); // TODO: delete
            var messageDeferral = e.GetDeferral();
            // Handle message and let registered handlers do whatever's needed.
            ValueSet req = e.Request.Message;
            ValueSet res = new ValueSet();
            try {
				appMessage?.Invoke(req, res);
            } catch (Exception err) {
                res.Add("error", err.ToString());
            }
            await e.Request.SendResponseAsync(res);
            // Complete the deferral so that the platform knows that we're done responding to the app service call.
            // Note for error handling: this must be called even if SendResponseAsync() throws an exception.
            messageDeferral.Complete();
        }

        static public async Task Send(string cmd, string data = null) {
            ValueSet valueset = new ValueSet();
            valueset.Add("cmd", cmd);
            if (data != null)
                valueset.Add("data", data);
            await Send(valueset);
        }
        static public async Task Send(ValueSet valueset) {
            await SendToUwp(valueset);
            //await Task.WhenAll(SendToUwp(valueset), SendToChildProcesses(valueset));
        }

        static public async Task SendToUwp(ValueSet valueset) {
            if (connection != null)
                await connection.SendMessageAsync(valueset);
        }

        static public async Task SendToChildProcesses(string message) {
            byte[] buffer = Encoding.UTF8.GetBytes(message + "\n");
            await pipe.Write(buffer);
        }

		static public async Task NotifyMasterBgProcess() {
			try {
				var pipe = new NamedPipeClientStream(".", IPC.mutexName, PipeDirection.InOut, PipeOptions.Asynchronous);
				await pipe.ConnectAsync();
			} catch (Exception err) {
				MessageBox.Show($"error {err}");
			}
		}



    }

}
