using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Text;
using System.Windows.Forms;
using Windows.ApplicationModel;
using Windows.Foundation.Collections;


namespace BackgroundProcess {

    class Systray : ApplicationContext {

        private NotifyIcon tray = null;

        // IPC ------------------------------------------------------------------------------------------------------

        public Systray() {
            var iconPath = "C:/Dev/Anchora/app/images/StoreLogo.png"; // TODO: delete
            //var iconPath = "app/images/StoreLogo.png"; // TODO: delete
            string[] items = new string[] {"hai"}; // TODO: delete
            Create(iconPath, items); // TODO: delete
            IPC.handlers.Add(MessageHandler);
        }

        public void MessageHandler(ValueSet req, ValueSet res) {
            if (!req.ContainsKey("event")) return;
            switch (req["event"] as string) {
                case "systray-create":
                    string[] items = null; // TODO
                    Create(req["icon"] as string, items);
                    break;
                case "systray-icon":
                    ChangeIcon(req["icon"] as string);
                    break;
                case "systray-change-items":
                    // TODO
                    //CreateContextMenu();
                    break;
                case "systray-show":
                    Show();
                    break;
                case "systray-hide":
                    Hide();
                    break;
                case "systray-destroy":
                case "exit":
                    Destroy();
                    break;
            }
        }

        // TRAY & MENU ------------------------------------------------------------------------------------------------------

        public void Create(string iconPath = null, string[] menuItems = null) {
            tray = new NotifyIcon();
            tray.Text = "Anchora HTTP Server";
            tray.DoubleClick += IPC.OpenUwpApp;
            tray.Visible = true;
            if (menuItems != null)
                CreateContextMenu(menuItems);
            if (iconPath != null)
                ChangeIcon(iconPath);
        }

        public void CreateContextMenu(string[] list) {
            List<MenuItem> items = new List<MenuItem>();
            string appName = null;
            try {
                appName = Package.Current.DisplayName;
            } catch { }
            MenuItem openUwpApp = new MenuItem($"Open {appName}", IPC.OpenUwpApp);
            openUwpApp.DefaultItem = true;
            items.Add(openUwpApp);
            foreach (string name in list) {
                MenuItem item = new MenuItem(name, OnClick);
                item.Tag = name.ToLower(); // TODO
                //item.Tag = id;
                items.Add(item);
            }
            items.Add(new MenuItem("Exit", Exit));
            tray.ContextMenu = new ContextMenu(items.ToArray());
        }

        // ICONS ------------------------------------------------------------------------------------------------------

        public string GetIconPath(string iconPath) {
            if (File.Exists(iconPath))
                return iconPath;
            var cwd = Directory.GetCurrentDirectory();
            var absPath = Path.Combine(cwd, iconPath);
            if (File.Exists(absPath))
                return absPath;
            return null;
        }

        public string GetDefaultIconPath() {
            var cwd = Directory.GetCurrentDirectory();
            var csProjPath = Path.Combine(cwd, "app/Assets/StoreLogo.png");
            var jsProjPath = Path.Combine(cwd, "app/images/StoreLogo.png");
            if (File.Exists(csProjPath)) return csProjPath;
            if (File.Exists(jsProjPath)) return jsProjPath;
            return null;
        }

        // Expects unsanitized argument. iconPath may be absolute or relative path and it may not even exist.
        // Tries to look for default PNG app logo created by Visual Studio in either /Assets or /images folder.
        public void ChangeIcon(string iconPath = null) {
            if (iconPath == null) {
                // Look for default logo in /Assets or /images.
                iconPath = GetDefaultIconPath();
                if (iconPath != null)
                    SetIcon(iconPath);
            } else {
                // Some icon path was specified. Sanitize it and try to get the image.
                iconPath = GetIconPath(iconPath);
                if (iconPath != null)
                    SetIcon(iconPath);
            }
        }
        // Expects existing path to be passed
        private void SetIcon(string iconPath) {
            iconPath = GetIconPath(iconPath);
            Bitmap bitmap = Image.FromFile(iconPath) as Bitmap;
            tray.Icon = Icon.FromHandle(bitmap.GetHicon());
            tray.Visible = true;
        }


        // HANDLERS ------------------------------------------------------------------------------------------------------

        async void OnClick(object sender, EventArgs e) {
            string id = (sender as MenuItem).Tag.ToString();
            await IPC.Send("systrayClicked", id);
        }

        public void Show() {
            tray.Visible = true;
        }

        public void Hide() {
            tray.Visible = false;
        }

        private void Destroy() {
            if (tray == null) return;
            tray.Visible = false;
            try {
                tray.ContextMenu.Dispose();
                tray.Dispose();
            } finally {
                tray = null;
            }
        }

        private async void Exit(object sender, EventArgs e) {
            try {
                await IPC.Send("exit");
                Destroy();
            } finally {
                Application.Exit();
            }
        }

    }

}
