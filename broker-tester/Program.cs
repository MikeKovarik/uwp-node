using System;
using Windows.Foundation.Collections;
using UwpNodeBroker;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using System.Windows.Forms;
using System.Threading.Tasks;
using System.Collections.Generic;
using System.Text;
using System.Linq;

namespace UwpNodeBrokerTester {

	class Program {

		static public NamedPipe pipe;

		[STAThread]
		static void Main() {
			UWP.Init();
			IPC.Init();
			ChildProcesses.Init();

			UWP.connection = new MockConnection();

			Application.Run();
		}

	}

}
