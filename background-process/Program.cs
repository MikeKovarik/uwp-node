using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using System.Windows.Forms;
using Windows.ApplicationModel;

namespace BackgroundProcess {

    static class Program {

        [STAThread]
        static void Main() {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            try {
                Directory.SetCurrentDirectory(Package.Current.InstalledLocation.Path);
            } catch { }
            new Systray();
            new Launcher();
            Application.Run();
        }
        /*
        [STAThread]
        static void Main() {
            Mutex mutex = null;
            if (!Mutex.TryOpenExisting("MySystrayExtensionMutex", out mutex)) {
                mutex = new Mutex(false, "MySystrayExtensionMutex");
                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);
                Application.Run(new SystrayApplicationContext());
                mutex.Close();
            }
        }
        */
    }

}
