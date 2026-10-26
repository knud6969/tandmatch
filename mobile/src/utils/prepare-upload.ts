import * as ImageManipulator from "expo-image-manipulator";
import { bytesFromBase64, resizeFor, UPLOAD_JPEG_QUALITY, UPLOAD_MAX_EDGE } from "./chat-images";

// Nedskalerer og komprimerer på telefonen før upload (chatten og beskedtråden). Genindkodningen fjerner også EXIF og lokation
// (billedet gemmes som nyt JPEG).
export async function prepareForUpload(asset: { uri: string; width: number; height: number }): Promise<{ uri: string; bytes: number }> {
  const resize = resizeFor(asset.width, asset.height, UPLOAD_MAX_EDGE);
  const result = await ImageManipulator.manipulateAsync(asset.uri, resize ? [{ resize }] : [], {
    compress: UPLOAD_JPEG_QUALITY,
    format: ImageManipulator.SaveFormat.JPEG,
    base64: true, // kun for at kende filstørrelsen; teksten bruges ikke videre
  });
  return { uri: result.uri, bytes: bytesFromBase64(result.base64 ?? "") };
}
