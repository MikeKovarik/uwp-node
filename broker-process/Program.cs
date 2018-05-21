using System;
using System.IO;
using System.Threading;
using System.Windows.Forms;
using Windows.ApplicationModel;

namespace UwpNodeBroker {

    static class Program {

		static Mutex mutex;
		static Launcher children;

		[STAThread]
        static void Main() {
			// Get info about UWP app.
            try {
                Directory.SetCurrentDirectory(Package.Current.InstalledLocation.Path);
            } catch { }
			// Make sure this background pocess only launches in a single instance.
			if (!Mutex.TryOpenExisting(IPC.mutexName, out mutex))
				StartAsMaster();
			else
				StartAsSlave();
		}

		// This BG process is the first one and will be the only one.
		// It has to maintain connection to the UWP app, watch lifecycle and child processes,
		// and try to re-establish the connection with the APP if it's closed and opened again.
		static void StartAsMaster() {
			HandleLifecycle();
			mutex = new Mutex(false, IPC.mutexName);
            Application.EnableVisualStyles();
			Application.SetCompatibleTextRenderingDefault(false);
			children = new Launcher();
            Application.Run();
            mutex.Close();
		}

		static async void StartAsSlave() {
			// This is a slave BG process. It needs to be killed but first notify master to reconnect to
			// the (newly started) UWP app which started this new instance because it does not have access
			// to the one already running (master).
			await IPC.NotifyMasterBgProcess();
			Environment.Exit(0);
		}

		static void HandleLifecycle() {
			// Open named pipe used exclusively by this BG process and other slave instances to communicate
			// that slave instance has been created. Those are created when UWP app is restarted but it does
			// not have referrence to previous (master) instance. We're using this because WMI events require
			// admin priviledges and there are no other way of watching app or process start in C# nor UWP. 
			var pipe = new NamedPipe(IPC.mutexName, 100);
			// Connect to UWP app if we detect new one has been started but it has no means of connecting to
			// this BG process instance.
			pipe.connection += () => IPC.ConnectToUwp();
			// Keep updating child processed of UWP app lifecycle
			IPC.appConnection += () => IPC.SendToChildProcesses("app-connection");
			IPC.appClose      += () => IPC.SendToChildProcesses("app-close");
			// Kill this BG process if it does not babysit any child processes.
			IPC.appClose += () => {
				if (IPC.keepAlive == false || children.processes.Count == 0) {
					Environment.Exit(0);
				} else {
					MessageBox.Show("app closed, keep bg alive");
				}
			};
		}

	}

}
