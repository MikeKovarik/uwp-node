using System;
using System.Threading.Tasks;
using Windows.ApplicationModel.Activation;
using Windows.ApplicationModel.AppService;
using Windows.ApplicationModel.Background;
using Windows.ApplicationModel.Core;
using Windows.Foundation;
using Windows.Foundation.Collections;
using Windows.Foundation.Metadata;
using Windows.UI.Core;
using Windows.UI.Popups;


namespace UwpNode {

    // This Runtime Component is necessary because there is no way to access the OnBackgroundActivated event and TaskInstance
    // of fulltrust process from JS. AppServiceConnection can be used, manipulated and listened to from JS, but there is just
    // no way to get it without this runtime component.
    // NOTE: A lot of code was moved to JS side of uwp-node, but the canceled event has to be handled in C# because
    //       manipulation with TaskInstance in JS throws errors.
    [AllowForWeb]
    public sealed class UwpNodeRuntimeComponent {

        public AppServiceConnection GetConnection() => connection;
        AppServiceConnection connection;
        BackgroundTaskDeferral taskInstanceDeferral = null;

        // Events
        public event EventHandler<AppServiceConnection> connect;
        public event EventHandler<object> canceled;

        // Called when fulltrust background process is launched.
        // User has to call this method from their App.cs
        public void OnBackgroundActivated(BackgroundActivatedEventArgs args) {
            //CoreApplication.MainView.Dispatcher.RunAsync(CoreDispatcherPriority.Normal, async () => await (new MessageDialog("OnBackgroundActivated")).ShowAsync()); // TODO: delete
            if (args.TaskInstance.TriggerDetails is AppServiceTriggerDetails details) {
                // Get task's deferal to enable the Canceled event.
                taskInstanceDeferral = args.TaskInstance.GetDeferral();
                args.TaskInstance.Canceled += OnTaskCanceled;
                connection = details.AppServiceConnection;
                connect?.Invoke(null, connection);
            }
        }

        // Called when background task closes.
        private void OnTaskCanceled(IBackgroundTaskInstance sender, BackgroundTaskCancellationReason reason) {
            //CoreApplication.MainView.Dispatcher.RunAsync(CoreDispatcherPriority.Normal, async () => await (new MessageDialog("OnTaskCanceled")).ShowAsync()); // TODO: delete
            // Complete the service deferral.
            if (taskInstanceDeferral != null)
                taskInstanceDeferral.Complete();
            canceled?.Invoke(null, null);
        }

    }

}
