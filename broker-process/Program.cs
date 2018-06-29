using System;
using System.IO;
using System.IO.Pipes;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using Windows.ApplicationModel;

namespace UwpNodeBroker {

    static class Program {

		static Mutex mutex;

		[STAThread]
        static void Main() {
			// Get info about UWP app.
            try {
                Directory.SetCurrentDirectory(Package.Current.InstalledLocation.Path);
            } catch { }
			// Make sure this background pocess only launches in a single instance.
			if (Mutex.TryOpenExisting(UWP.name, out mutex))
				StartAsSlave();
			else
				StartAsMaster();
		}

		// This BG process is the first one and will be the only one.
		// It has to maintain connection to the UWP app, watch lifecycle and child processes,
		// and try to re-establish the connection with the APP if it's closed and opened again.
		static void StartAsMaster() {
			// Open named pipe used exclusively by this BG process and other slave instances to communicate
			// that slave instance has been created. Those are created when UWP app is restarted but it does
			// not have referrence to previous (master) instance. We're using this because WMI events require
			// admin priviledges and there are no other way of watching app or process start in C# nor UWP. 
			var slavePipe = new NamedPipe(UWP.name, 100);
			// Connect to UWP app if we detect new one has been started but it has no means of connecting to
			// this BG process instance.
			slavePipe.connection += () => UWP.Connect();
			// Open exclusive mutex to signify that this is the master mutex process for the app.
			mutex = new Mutex(false, UWP.name);
			// TODO: is this even needed?
            Application.EnableVisualStyles();
			Application.SetCompatibleTextRenderingDefault(false);
			// Run blockingly. And release the mutex when the app quits.
            Application.Run();
            mutex.Close();
		}

		// Watches state of the UWP app and child processes and kills this broker if possible.
		static void WatchReferences() {
			UWP.closed += CloseIfPossible;
			ChildProcesses.processClosed += CloseIfPossible;
			// Check every three minutes. Just in case.
			Task.Run(async () => {
				while (true) {
					await Task.Delay(1000 * 60 * 3);
					CloseIfPossible();
				}
			});
		}

		// Closes the broker if UWP app is closed and no child processes are running.
		static void CloseIfPossible() {
			if (UWP.isConnected && ChildProcesses.processes.Count == 0)
				Environment.Exit(0);
		}

		static async void StartAsSlave() {
			// This is a slave BG process. It needs to be killed. 
			// Notify master broker process to reconnect to the (newly started) UWP app which started this
			// new instance because it does not have access to the one already running (master).
			try {
				var pipe = new NamedPipeClientStream(".", UWP.name, PipeDirection.InOut, PipeOptions.Asynchronous);
				await pipe.ConnectAsync();
			} catch (Exception err) {
				// TODO remove
				MessageBox.Show($"error {err}");
			}
			// Close self and let the app use master broker process.
			Environment.Exit(0);
		}

	}

}
