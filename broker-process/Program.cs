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
			// Kickstart static constructors.
			// NOTE: All classes are static instead of instance, because they're tightly coupled singletons.
			// But static constructors are called on demand (at first access or call to the class), not at startup.
			IPC.Init();
			// Open named pipe that is used exclusively by this background broker process and potentional future
			// broker instances. It is used to signal wheter there's already existing broker to ensure there's always
			// only one broker at a time. It's necessary because new instance of UWP app cannot reconnect to preexisting
			// background process that was spawned by previous instance of the app.
			var slavePipe = new NamedPipe(UWP.name, 100);
			// If new connection occurs on the pipe, it means another broker process has been spawned by a new UWP instance
			// that has no way of knowing of existence of (let alone connecting to) this broker process.
			// But we can connect to the UWP from here.
			slavePipe.Connection += () => UWP.Connect();
			// Lifecycle & selfclose watchdog.
			WatchReferences();
			// Open exclusive mutex to signify that this is the master mutex process for the app.
			mutex = new Mutex(false, UWP.name);
			// TODO: is this even needed?
			Application.EnableVisualStyles(); // TODO: remove?
			Application.SetCompatibleTextRenderingDefault(false); // TODO: remove?
			// Run blockingly. And release the mutex when the app quits.
			Application.Run();
			Close();
		}

		// Watches state of the UWP app and child processes and kills this broker if possible.
		static void WatchReferences() {
			UWP.Closed += CloseIfPossible;
			ChildProcesses.Change += CloseIfPossible;
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
			if (!UWP.isConnected && ChildProcesses.Children.Count == 0)
				Close();
		}

		static void Close() {
			mutex.Close();
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
				//MessageBox.Show($"error {err}");
			}
			// Close self and let the app use master broker process.
			Environment.Exit(0);
		}

	}

}
