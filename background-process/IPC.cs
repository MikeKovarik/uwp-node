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

// Package.Current.DisplayName
// Package.Current.Id.FamilyName
// Package.Current.InstalledLocation.Path

namespace BackgroundProcess {

    class IPC {
        // TODO: handle when the apps reopens but not by this process.
        //       the app would then go on to create new background process, rather than reconnecting to this one.
        // TODO: do not pass stdio/pipe related messages down to pipes

        static public AppServiceConnection uwpAppConn = null;
        static public AppServiceConnection connection = null; // todo delete
        static public NamedPipe childInternalIpcPipe = null;
        static string serviceName = "uwp-node";

        static public List<Action<ValueSet, ValueSet>> handlers = new List<Action<ValueSet, ValueSet>>();



        static IPC() {
            //MessageBox.Show("ipc static constructor");
            CreateUwpConnection();
            //CreateChildProcessPipe();
            int pid = Process.GetCurrentProcess().Id;
        }

        static public void CreateChildProcessPipe() {
            childInternalIpcPipe = new NamedPipe(serviceName, 100);
        }

        static private void OnChildPipeData(object sender, object data) {
            byte[] buffer = data as byte[];
            string str = System.Text.Encoding.UTF8.GetString(buffer);
            Console.WriteLine($"data {buffer.Length} {str}");
            childInternalIpcPipe.Write(buffer, sender);
        }

        static public async Task CreateUwpConnection() {
            if (connection != null) return;
            connection = new AppServiceConnection();
            connection.PackageFamilyName = Package.Current.Id.FamilyName;
            connection.AppServiceName = serviceName;
            connection.ServiceClosed += OnServiceClosed;
            connection.RequestReceived += OnUwpMessage;
            AppServiceConnectionStatus status = await connection.OpenAsync();
            if (status != AppServiceConnectionStatus.Success) {
                MessageBox.Show($"Failed to connect uwp-node background process to UWP App {Package.Current.DisplayName}: {status}");
            }
        }

        static public async Task EnsureConnection() {
            // TODO: do a better detection of when to create connection
            // if the app is closed and CreateConnection() is called, the app will temporarily open and close again.
            // Might cause troubless with high traffic ipc
            if (connection != null) return;
            await CreateUwpConnection();
        }

        static public async void OpenUwpApp(object sender = null, EventArgs args = null) {
            IEnumerable<AppListEntry> appListEntries = await Package.Current.GetAppListEntriesAsync();
            await appListEntries.First().LaunchAsync();
            await EnsureConnection();
        }

        static private void OnServiceClosed(AppServiceConnection sender, AppServiceClosedEventArgs args) {
            //MessageBox.Show("OnServiceClosed"); // TODO: delete
            connection.ServiceClosed -= OnServiceClosed;
            connection = null;
        }

        static private async void OnUwpMessage(AppServiceConnection sender, AppServiceRequestReceivedEventArgs e) {
            MessageBox.Show("OnRequestReceived"); // TODO: delete
            var messageDeferral = e.GetDeferral();
            // Handle message and let registered handlers do whatever's needed.
            ValueSet req = e.Request.Message;
            ValueSet res = new ValueSet();
            try {
                foreach (Action<ValueSet, ValueSet> handler in handlers)
                    handler(req, res);
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

        static public async Task SendToChildProcesses(ValueSet valueset) {
            string json = ValueSetToJson(valueset);
            byte[] buffer = Encoding.UTF8.GetBytes(json);
            await childInternalIpcPipe.Write(buffer);
        }

        static public string ValueSetToJson(ValueSet message) {
            List<string> properties = new List<string>() { "John", "Anna", "Monica" };
            foreach (var pair in message)
                properties.Add($"\"{pair.Key}\": \"{pair.Value}\"");
            return "{" + String.Join(", ", properties.ToArray()) + "}";
        }


    }

}
