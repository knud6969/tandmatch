import { useCallback, useEffect, useRef, useState } from "react";
import { Alert } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { MESSAGE_MAX_IMAGES } from "@/lib/common/constants/limits";
import { hasCurrentConsent } from "@/lib/identity/domain/consents";
import { getConsents, grantConsent } from "~/api/consents";
import { withinSizeLimit } from "~/utils/chat-images";
import { deleteLocalFiles } from "~/utils/local-files";
import { prepareForUpload } from "~/utils/prepare-upload";
import type { ImageSource } from "~/hooks/use-chat-images";

// Et valgt billede, der endnu ikke er sendt: den komprimerede fil (sendes) og vælgerens original (slettes sammen med den).
export type MessageAttachment = { key: string; uri: string; original: string };

const SIZE_TEXT = "Billedet er for stort. Prøv et andet billede.";
const PERMISSION_TEXT = "TandMatch har ikke adgang. Du kan give adgang under Indstillinger på telefonen.";
const LIMIT_TEXT = `Du kan højst vedhæfte ${MESSAGE_MAX_IMAGES} billeder pr. besked.`;

// Billeder til en besked i tråden (features/leads/README.md 10.12). Samme vælger og samme samtykke som i chatten (9.4): første
// gang uden gældende image_upload-samtykke vises samtykkekortet, og først derefter åbnes kamera eller bibliotek. Billederne
// komprimeres straks på telefonen, men sendes først sammen med beskeden. Lokale filer slettes, når de er sendt, fjernet,
// eller skærmen lukkes (helbredsdata).
export function useMessageImages() {
  const [attachments, setAttachments] = useState<MessageAttachment[]>([]);
  const [preparing, setPreparing] = useState(0);
  // "retry": serveren afviste afsendelsen med CONSENT_REQUIRED; efter samtykket sendes beskeden igen af skærmen, intet vælges.
  const [awaitingConsent, setAwaitingConsent] = useState<ImageSource | "retry" | null>(null);
  const [consentPending, setConsentPending] = useState(false);
  const [consentError, setConsentError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const counter = useRef(0);
  const current = useRef<MessageAttachment[]>([]);
  useEffect(() => {
    current.current = attachments;
  }, [attachments]);
  useEffect(
    () => () => {
      deleteLocalFiles(current.current.flatMap((a) => [a.uri, a.original]));
    },
    [],
  );

  const room = MESSAGE_MAX_IMAGES - attachments.length - preparing;

  const addAsset = useCallback(async (asset: { uri: string; width: number; height: number }) => {
    setPreparing((n) => n + 1);
    try {
      const file = await prepareForUpload(asset);
      if (!withinSizeLimit(file.bytes)) {
        deleteLocalFiles([file.uri, asset.uri]);
        setNotice(SIZE_TEXT);
        return;
      }
      const key = `vedhaeftet-${(counter.current += 1)}`;
      setAttachments((list) => [...list, { key, uri: file.uri, original: asset.uri }]);
    } catch {
      deleteLocalFiles([asset.uri]);
      setNotice("Billedet kunne ikke gøres klar. Prøv et andet billede.");
    } finally {
      setPreparing((n) => n - 1);
    }
  }, []);

  const pick = useCallback(
    async (source: ImageSource) => {
      setNotice(null);
      if (room <= 0) {
        setNotice(LIMIT_TEXT);
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
          result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 1, exif: false, allowsMultipleSelection: room > 1, selectionLimit: room });
        }
        if (result.canceled) return;
        // Højst så mange, som der er plads til; resten ignoreres.
        for (const asset of result.assets.slice(0, room)) void addAsset(asset);
      } catch {
        setNotice("Billedet kunne ikke åbnes. Prøv igen.");
      }
    },
    [addAsset, room],
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
    Alert.alert("Vedhæft billede", "Billedet er helbredsdata og sendes kun til klinikken i denne tråd.", [
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
      if (source !== "retry") await pick(source);
    } catch (error) {
      setConsentError(error instanceof Error ? error.message : "Samtykket kunne ikke gemmes. Prøv igen.");
    } finally {
      setConsentPending(false);
    }
  }, [awaitingConsent, pick]);

  // Afvist samtykke: der vedhæftes intet.
  const declineConsent = useCallback(() => {
    setAwaitingConsent(null);
    setConsentError(null);
  }, []);

  // Serveren afviste med CONSENT_REQUIRED (samtykket er trukket tilbage et andet sted): spørg igen; billederne bliver liggende.
  const requireConsent = useCallback(() => setAwaitingConsent("retry"), []);

  const remove = useCallback((key: string) => {
    setAttachments((list) => {
      const removed = list.find((a) => a.key === key);
      if (removed) deleteLocalFiles([removed.uri, removed.original]);
      return list.filter((a) => a.key !== key);
    });
  }, []);

  // Efter afsendelse: de lokale filer slettes.
  const clear = useCallback(() => {
    setAttachments((list) => {
      deleteLocalFiles(list.flatMap((a) => [a.uri, a.original]));
      return [];
    });
  }, []);

  return {
    attachments,
    preparing: preparing > 0,
    canAdd: room > 0,
    chooseSource,
    awaitingConsent: awaitingConsent !== null,
    consentPending,
    consentError,
    grantConsent: grantConsentAndPick,
    declineConsent,
    requireConsent,
    remove,
    clear,
    notice,
  };
}
