declare module 'electron' {
  export const app: any;
  export class BrowserWindow {
    constructor(options?: any);
    loadURL(url: string): void;
    loadFile(path: string): void;
    show(): void;
    hide(): void;
    focus(): void;
    isMinimized(): boolean;
    restore(): void;
    close(): void;
    webContents: any;
    on(event: string, listener: (...args: any[]) => void): void;
    setMenuBarVisibility(visible: boolean): void;
  }
  export class Tray {
    constructor(image: any);
    setToolTip(toolTip: string): void;
    setContextMenu(menu: any): void;
    on(event: string, listener: (...args: any[]) => void): void;
  }
  export const Menu: any;
  export const nativeImage: any;
  export const Notification: any;
  export const dialog: any;
  export const ipcMain: any;
}