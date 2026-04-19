import { useCallback, type KeyboardEvent } from "react";
import type { SearchRouteSource } from "../../search/search-route-state";
import {
  DesktopSearchDropdownPanel,
  useDesktopSearchLauncher,
} from "../../search/desktop-search-launcher";
import {
  DesktopContactsWorkspace,
  type DesktopContactsWorkspaceProps,
} from "./desktop-contacts-workspace";

type DesktopContactsWorkspaceShellProps = Omit<
  DesktopContactsWorkspaceProps,
  | "searchContainerRef"
  | "onSearchOpen"
  | "onSearchKeyDown"
  | "searchPanel"
  | "speechListening"
  | "speechStatus"
  | "speechSupported"
  | "speechButtonDisabled"
  | "onSpeechButtonClick"
> & {
  searchSource: SearchRouteSource;
};

export function DesktopContactsWorkspaceShell({
  searchSource,
  searchText,
  onSearchTextChange,
  ...workspaceProps
}: DesktopContactsWorkspaceShellProps) {
  const desktopSearchLauncher = useDesktopSearchLauncher({
    keyword: searchText,
    onKeywordChange: onSearchTextChange,
    source: searchSource,
  });

  const handleSearchKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.defaultPrevented || event.key !== "Enter") {
        return;
      }

      event.preventDefault();
      desktopSearchLauncher.openSearch();
    },
    [desktopSearchLauncher],
  );

  return (
    <DesktopContactsWorkspace
      {...workspaceProps}
      searchContainerRef={desktopSearchLauncher.containerRef}
      searchText={searchText}
      onSearchTextChange={onSearchTextChange}
      onSearchOpen={() => desktopSearchLauncher.setIsOpen(true)}
      onSearchKeyDown={handleSearchKeyDown}
      searchPanel={
        desktopSearchLauncher.isOpen ? (
          <DesktopSearchDropdownPanel
            history={desktopSearchLauncher.history}
            keyword={searchText}
            onClose={desktopSearchLauncher.close}
            onOpenSearch={desktopSearchLauncher.openSearch}
            speechDisplayText={desktopSearchLauncher.speechDisplayText}
            speechError={desktopSearchLauncher.speechError}
            speechStatus={desktopSearchLauncher.speechStatus}
          />
        ) : null
      }
      speechListening={desktopSearchLauncher.speechListening}
      speechStatus={desktopSearchLauncher.speechStatus}
      speechSupported={desktopSearchLauncher.speechSupported}
      speechButtonDisabled={desktopSearchLauncher.speechButtonDisabled}
      onSpeechButtonClick={(event) => {
        event.preventDefault();
        desktopSearchLauncher.handleSpeechButtonClick();
      }}
    />
  );
}
