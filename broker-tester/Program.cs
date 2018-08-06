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

namespace UwpNodeBroker {

	class Program {

		static public NamedPipe pipe;

		[STAThread]
		static void Main() {
			IPC.Init();
			Application.Run();
		}

	}

}
