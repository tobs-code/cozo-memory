// @ts-ignore
import * as ort from 'onnxruntime-node';

async function test() {
    console.log("TS-Node ONNX Test");
    try {
        // @ts-ignore
        await ort.InferenceSession.create("non-existent.onnx");
    } catch (e: any) {
        console.log("Error:", e.message);
    }
}

test();
