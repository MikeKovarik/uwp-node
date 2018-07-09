using System;
using Windows.ApplicationModel.Activation;
using Windows.ApplicationModel.AppService;
using Windows.ApplicationModel.Background;
using Windows.Foundation.Metadata;


namespace UwpNode {

    // This Runtime Component is necessary because there is no way to access the OnBackgroundActivated event and TaskInstance
    // of fulltrust process from JS. AppServiceConnection can be used, manipulated and listened to from JS, but there is just
    // no way to get it without this runtime component.
    // NOTE: A lot of code was moved to JS side of uwp-node, but the canceled event has to be handled in C# because
    //       manipulation with TaskInstance in JS throws errors.
    [AllowForWeb]
    public sealed class UwpNodeRuntimeComponent {

        public event EventHandler<BackgroundActivatedEventArgs> backgroundactivated;

        // Called when fulltrust background process is launched.
        // User has to call this method from their App.cs
        public void OnBackgroundActivated(BackgroundActivatedEventArgs args) {
			// Publish the raw event.
            backgroundactivated?.Invoke(null, args);
        }


    }

}
