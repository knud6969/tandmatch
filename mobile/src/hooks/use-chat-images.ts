import { useCallback, useEffect, useRef, useState } from "react";
import { Alert } from "react-native";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { hasCurrentConsent } from "@/lib/identity/domain/consents";
import type { ImageDto } from "@/lib/common/types/common";
import { getConsents, grantConsent } from "~/api/consents";
import { ApiRequestError } from "~/api/client";
import { deleteCaseImage, uploadCaseImage } from "~/api/images";
import { confirmAction } from "~/components/ui";
import { bytesFromBase64, chatImageItems, resizeFor, slotsLeft, uploadErrorText, uploadFilePart, UPLOAD_JPEG_QUALITY, UPLOAD_MAX_EDGE, withinSizeLimit, type LocalImage } from "~/utils/chat-images";

export type ImageSource = "camera" | "library";

const SIZE_TEXT = "Billedet er for stort. Prøv et andet billede.";
const PERMISSION_TEXT = "TandMatch har ikke adgang. Du kan give adgang under Indstillinger på telefonen.";

// Nedskalerer og komprimerer på telefonen. Genindkodningen fjerner også EXIF og lokation (billedet gemmes som nyt JPEG).
async function prepare(asset: { uri: string; width: number; height: number }): Promise<{ uri: string; bytes: number }> {
  const resize = resizeFor(asset.width, asset.height, UPLOAD_MAX_EDGE);
  const result = await ImageManipulator.manipulateAsync(asset.uri, resize ? [{ resize }] : [], {
    compress: UPLOAD_JPEG_QUALITY,
    format: ImageManipulator.SaveFormat.JPEG,
    base64: true, // kun for at kende filstørrelsen; teksten bruges ikke videre
  });
  return { uri: result.uri, bytes: bytesFromBase64(result.base64 ?? "") };
}

// Billeder i chatten (architecture 9.3, 9.4): samtykke først, derefter tag/vælg, komprimér og upload. Intet uploades uden samtykke.
// Når en upload-batch er færdig (mindst ét billede gemt, ingen i gang), kaldes onBatchUploaded: så starter billedturen (7.9c).
export function useChatImages(caseId: string, uploaded: readonly ImageDto[], onChanged: () => void, onBatchUploaded?: () => void) {
  const [local, setLocal] = useState<LocalImage[]>([]);
  const [awaitingConsent, setAwaitingConsent] = useState<ImageSource | null>(null);
  const [consentPending, setConsentPending] = useState(false);
  const [consentError, setConsentError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const prepared = useRef(new Map<string, string>());
  const counter = useRef(0);
  const inFlight = useRef(0);
  const batchOk = useRef(false);
  const batchDone = useRef(onBatchUploaded);
  useEffect(() => {
    batchDone.current = onBatchUploaded;
  }, [onBatchUploaded]);

  const uploadedCount = uploaded.length;
  const busy = local.some((image) => image.status === "uploading");
  const left = slotsLeft(uploadedCount + local.filter((image) => image.status === "uploading").length);

  const patch = useCallback((key: string, next: Partial<LocalImage>) => {
    setLocal((current) => current.map((image) => (image.key === key ? { ...image, ...next } : image)));
  }, []);

  // Ét upload er afsluttet; når alle i batchen er det, og mindst ét lykkedes, starter billedturen.
  const settle = useCallback((ok: boolean) => {
    inFlight.current = Math.max(0, inFlight.current - 1);
    if (ok) batchOk.current = true;
    if (inFlight.current === 0 && batchOk.current) {
      batchOk.current = false;
      batchDone.current?.();
    }
  }, []);

  const send = useCallback(
    async (key: string, uri: string, index: number): Promise<boolean> => {
      try {
        await uploadCaseImage(caseId, uploadFilePart(uri, index));
        prepared.current.delete(key);
        setLocal((current) => current.filter((image) => image.key !== key));
        onChanged();
        return true;
      } catch (error) {
        // Samtykket kan være trukket tilbage et andet sted: spørg igen i stedet for at vise en fejl.
        if (error instanceof ApiRequestError && error.code === "CONSENT_REQUIRED") {
          patch(key, { status: "failed", error: "Samtykket mangler. Giv samtykke og prøv igen." });
          return false;
        }
        patch(key, { status: "failed", error: uploadErrorText(error) });
        return false;
      }
    },
    [caseId, onChanged, patch],
  );

  const handleAsset = useCallback(
    async (asset: { uri: string; width: number; height: number }) => {
      const key = `lokal-${(counter.current += 1)}`;
      inFlight.current += 1;
      setLocal((current) => [...current, { key, uri: asset.uri, status: "uploading", error: null }]);
      try {
        const file = await prepare(asset);
        if (!withinSizeLimit(file.bytes)) {
          patch(key, { status: "failed", error: SIZE_TEXT });
          settle(false);
          return;
        }
        prepared.current.set(key, file.uri);
        settle(await send(key, file.uri, uploadedCount));
      } catch {
        patch(key, { status: "failed", error: "Billedet kunne ikke gøres klar. Prøv et andet billede." });
        settle(false);
      }
    },
    [patch, send, settle, uploadedCount],
  );

  const pick = useCallback(
    async (source: ImageSource) => {
      setNotice(null);
      if (left === 0) {
        setNotice(uploadErrorText({ code: "IMAGE_LIMIT" }));
        return;
      }
      try {
        let result: ImagePicker.ImagePickerResult;
        if (source === "camera") {
          const permission = await ImagePicker.requestCameraPermissionsAsync();
          if (!permission.granted) {
            setNotice(PERMISSION_TEXT);
            return;
          }
          result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 1, exif: false });
        } else {
          result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 1, exif: false, allowsMultipleSelection: left > 1, selectionLimit: left });
        }
        if (result.canceled) return;
        // Højst så mange, som der er plads til; resten ignoreres.
        for (const asset of result.assets.slice(0, left)) void handleAsset(asset);
      } catch {
        setNotice("Billedet kunne ikke åbnes. Prøv igen.");
      }
    },
    [handleAsset, left],
  );

  // Første gang vises samtykket; først derefter åbnes kamera eller bibliotek.
  const start = useCallback(
    async (source: ImageSource) => {
      setNotice(null);
      try {
        const consents = await getConsents();
        if (hasCurrentConsent(consents, "image_upload")) await pick(source);
        else setAwaitingConsent(source);
      } catch (error) {
        setNotice(error instanceof Error ? error.message : "Prøv igen om lidt.");
      }
    },
    [pick],
  );

  const chooseSource = useCallback(() => {
    Alert.alert("Tilføj billede", "Billedet er helbredsdata og sendes først, når du har givet samtykke.", [
      { text: "Tag et billede", onPress: () => void start("camera") },
      { text: "Vælg fra biblioteket", onPress: () => void start("library") },
      { text: "Annuller", style: "cancel" },
    ]);
  }, [start]);

  const grantConsentAndPick = useCallback(async () => {
    if (!awaitingConsent) return;
    const source = awaitingConsent;
    setConsentPending(true);
    setConsentError(null);
    try {
      await grantConsent("image_upload");
      setAwaitingConsent(null);
      await pick(source);
    } catch (error) {
      setConsentError(error instanceof Error ? error.message : "Samtykket kunne ikke gemmes. Prøv igen.");
    } finally {
      setConsentPending(false);
    }
  }, [awaitingConsent, pick]);

  // Afvist samtykke: der uploades intet.
  const declineConsent = useCallback(() => {
    setAwaitingConsent(null);
    setConsentError(null);
  }, []);

  const retry = useCallback(
    (key: string) => {
      const uri = prepared.current.get(key);
      if (!uri) {
        setLocal((current) => current.filter((image) => image.key !== key));
        return;
      }
      patch(key, { status: "uploading", error: null });
      inFlight.current += 1;
      void send(key, uri, uploadedCount).then(settle);
    },
    [patch, send, settle, uploadedCount],
  );

  const remove = useCallback(
    (item: { key: string; imageId: string | null }) => {
      if (!item.imageId) {
        prepared.current.delete(item.key);
        setLocal((current) => current.filter((image) => image.key !== item.key));
        return;
      }
      const imageId = item.imageId;
      confirmAction({
        title: "Slet billedet?",
        message: "Billedet fjernes fra sagen, og AI'en ser det ikke længere.",
        confirmLabel: "Slet billedet",
        onConfirm: () => {
          deleteCaseImage(caseId, imageId)
            .then(onChanged)
            .catch((error: unknown) => setNotice(uploadErrorText(error)));
        },
      });
    },
    [caseId, onChanged],
  );

  return {
    items: chatImageItems(uploaded, local),
    canAdd: left > 0 && !busy,
    chooseSource,
    awaitingConsent: awaitingConsent !== null,
    consentPending,
    consentError,
    grantConsent: grantConsentAndPick,
    declineConsent,
    retry,
    remove,
    notice,
  };
}
