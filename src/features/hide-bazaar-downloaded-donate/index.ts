import {defineFeature} from "../../core/types";
import {mountHideBazaarDownloadedDonate} from "./style";

export default defineFeature({
    id: "hide-bazaar-downloaded-donate",
    category: "settings",
    enabled: true,
    name: "feature.hideBazaarDownloadedDonate.name",
    description: "feature.hideBazaarDownloadedDonate.desc",
    settings: [
        {
            kind: "switch",
            key: "enabled",
            title: "common.enabled",
            default: false,
        },
    ],
    mount: mountHideBazaarDownloadedDonate,
});
