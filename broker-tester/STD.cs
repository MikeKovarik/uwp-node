using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace UwpNodeBrokerTester {

	class STD {

		static public event Action<byte[]> IN;
		
		static private Stream stdin;
		static private Stream stdout;
		static private Stream stderr;

		static STD() {
			stdin  = Console.OpenStandardInput();
			stdout = Console.OpenStandardOutput();
			stderr = Console.OpenStandardError();
			StartReading();
		}

		static void StartReading() {
			int chunksize = 665536;
			Task.Run(async () => {
				try {
					byte[] buffer = new byte[chunksize];
					while (stdin.CanRead) {
						int bytesRead = await stdin.ReadAsync(buffer, 0, chunksize);
						if (bytesRead == 0)
							break;
						byte[] trimmed = new byte[bytesRead];
						Array.Copy(buffer, trimmed, bytesRead);
						IN?.Invoke(trimmed);
					}
				} catch (Exception err) {
					Console.WriteLine(err);
				}
			});
		}

		// STDOUT
		static public void Write(string str) {
			Write(Encoding.UTF8.GetBytes(str));
		}
		static public void Write(byte[] buffer) {
			stdout.Write(buffer, 0, buffer.Length);
		}

		// STDERR
		static public void Throw() {
		}

	}

}
