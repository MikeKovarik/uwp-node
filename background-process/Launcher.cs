using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO.Pipes;
using System.Text;
using System.Threading.Tasks;
using System.Windows.Forms;
using Windows.Foundation.Collections;


namespace BackgroundProcess {

    class Launcher {

        public Dictionary<int, Process> processes = new Dictionary<int, Process>();
        Dictionary<Process, List<NamedPipe>> procPipes = new Dictionary<Process, List<NamedPipe>>();

        public Launcher() {
			IPC.appMessage += MessageHandler;
        }

        void MessageHandler(ValueSet req, ValueSet res) {
            if (!req.ContainsKey("event")) return;
            int pid;
            Process proc;
            switch (req["cmd"] as string) {
                case "process-start":
                    StartProcess(req, res);
                    break;
                case "process-stop":
                    int.TryParse(req["pid"] as string, out pid);
                    StopProcess(pid);
                    break;
                case "process-stdin":
                    int.TryParse(req["pid"] as string, out pid);
                    processes.TryGetValue(pid, out proc);
                    InsertStdin(proc, req["data"] as string);
                    break;
                case "process-detach":
                    // TODO
                    break;
                case "process-reattach":
                    // TODO
                    break;
            }
        }

        public Task<Process> StartProcess(ValueSet req, ValueSet res, ProcessStartInfo info = null) => Task<Process>.Factory.StartNew(() => {
            try {
                Process proc = new Process();
                if (info == null)
                    info = new ProcessStartInfo();
                proc.StartInfo = info;
                info.RedirectStandardInput = true;
                info.RedirectStandardOutput = true;
                info.RedirectStandardError = true;
                info.CreateNoWindow = true;
                info.WindowStyle = ProcessWindowStyle.Hidden;
                info.UseShellExecute = false;
                // Setup what and where to start
                info.FileName = req["program"] as string;
                info.WorkingDirectory = req["cwd"] as string;
                info.Arguments = req["args"] as string;
                if (req.ContainsKey("admin"))
                    info.Verb = "runas";
                // Handle events
                proc.EnableRaisingEvents = true;
                proc.Exited += OnExited;

                //if ((req["spawn"] as string) == "endless") { // TODO: better api
                proc.OutputDataReceived += OnStdout;
                proc.ErrorDataReceived += OnStderr;
                // Start the process and begin receiving stdio streams.
                proc.Start();
                processes.Add(proc.Id, proc);
                res.Add("pid", proc.Id.ToString());
                proc.BeginOutputReadLine();
                proc.BeginErrorReadLine();
                //} else {
                //    // TODO
                //    proc.WaitForExit();
                //    var exitCode = proc.ExitCode;
                //    var output = proc.StandardOutput.ReadToEnd();
                //    var error = proc.StandardError.ReadToEnd();
                //}

                // TODO: pipes, and internal ipc pipe and await them
                return proc;
            } catch (Exception err) {
                res.Add("error", err.ToString());
                return null;
            }
        });

		// TODO
        public async void StartNodeProcess(ValueSet req, ValueSet res) {
            //StartServer("mypipe");
            string name = "mypipe";
            string[] pipeList = new string[] {"3","4","5"}; // TODO
            foreach (var pipeName in pipeList) {
            }
            NamedPipe pipe = new NamedPipe(name);
            Process proc = null;
            pipe.data  += (byte[] data) => OnPipeData(proc, pipe, data);
            pipe.error += (string err)  => OnPipeError(proc, pipe, err);
            pipe.end   += ()            => OnPipeEnd(proc, pipe);
            var info = new ProcessStartInfo();
            //info.Environment.Add("hello", "world"); // TODO
            proc = await StartProcess(req, res, info);
            if (proc != null) {
                // ok
                List<NamedPipe> pipes = new List<NamedPipe>();
                procPipes.Add(proc, pipes);
            } else {
                // error

            }
        }


        public void InsertStdin(Process proc, string data) {
            proc.StandardInput.WriteLine(data); // or just Write?
            proc.StandardInput.Flush();
        }

        private void OnStdout(object proc, DataReceivedEventArgs e) {
            if (e.Data == null) return;
            InformParent(proc, "process-stdout", e.Data);
        }

        private void OnStderr(object proc, DataReceivedEventArgs e) {
            if (e.Data == null) return;
            InformParent(proc, "process-stderr", e.Data);
        }

        private void OnPipeData(Process proc, NamedPipe pipe, object data) {
        }
        private void OnPipeError(Process proc, NamedPipe pipe, object data) {
        }
        private void OnPipeEnd(Process proc, NamedPipe pipe) {
        }

        private void OnExited(object sender, EventArgs e) {
            Process proc = sender as Process;
            InformParent(sender, "process-exited", proc.ExitCode);
            processes.Remove(proc.Id);
        }

        public void StopProcess(int pid) {
            if (processes.TryGetValue(pid, out Process proc))
                StopProcess(proc);

        }
        public void StopProcess(Process proc) {
            proc.Close();
            proc.Dispose();
            if (procPipes.TryGetValue(proc, out var pipes)) {
                foreach (NamedPipe pipe in pipes) {
                    pipe.Close();
                }
            }
        }


        private async void InformParent(object proc, string eventName, object val) {
            ValueSet message = new ValueSet();
            message.Add("event", eventName);
            message.Add("pid", (proc as Process).Id.ToString());
            message.Add("data", val.ToString());
            await IPC.SendToUwp(message);
        }


    }

}
