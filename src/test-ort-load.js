const ort = require('onnxruntime-node');
console.log("ONNX Runtime loaded successfully");

async function test() {
    try {
        // Try to create a session with a non-existent file to force binding load
        // This should throw "File not found" or similar from the BINDING, 
        // confirming the binding loaded.
        // If the binding fails to load, it will throw ERR_DLOPEN_FAILED or similar.
        console.log("Attempting to create session...");
        const session = await ort.InferenceSession.create("non-existent-model.onnx");
    } catch (e) {
        console.log("Caught error:", e.message);
        if (e.message.includes("DLOPEN")) {
            console.log("CONFIRMED: Binding failed to load.");
        } else if (e.message.includes("Load model from non-existent-model.onnx failed")) {
             console.log("CONFIRMED: Binding loaded successfully (but model file missing, which is expected).");
        } else {
             console.log("Other error:", e);
        }
    }
}

test();
