{pkgs}: {
  deps = [
    pkgs.gdk-pixbuf
    pkgs.cairo
    pkgs.pango
    pkgs.dbus
    pkgs.cups
    pkgs.at-spi2-atk
    pkgs.alsa-lib
    pkgs.expat
    pkgs.mesa
    pkgs.nss
    pkgs.libxkbcommon
    pkgs.xorg.libXrandr
    pkgs.xorg.libXfixes
    pkgs.xorg.libXext
    pkgs.xorg.libXdamage
    pkgs.xorg.libXcomposite
    pkgs.xorg.libX11
    pkgs.xorg.libxcb
    pkgs.chromium
  ];
}
