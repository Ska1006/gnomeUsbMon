UUID = gnome-usb-mon@ska1006.github.io
INSTALL_DIR = $(HOME)/.local/share/gnome-shell/extensions/$(UUID)
FILES = metadata.json extension.js prefs.js stylesheet.css lib ui schemas

.PHONY: all schemas install uninstall enable disable reload-nested pack test lint pot clean

all: schemas

schemas: schemas/gschemas.compiled

schemas/gschemas.compiled: schemas/*.gschema.xml
	glib-compile-schemas schemas/

install: schemas
	rm -rf "$(INSTALL_DIR)"
	mkdir -p "$(INSTALL_DIR)"
	cp -r $(FILES) "$(INSTALL_DIR)/"
	@echo "Installed -> $(INSTALL_DIR)"
	@echo "Wayland: logout/login, then: gnome-extensions enable $(UUID)"

enable:
	gnome-extensions enable $(UUID)

disable:
	gnome-extensions disable $(UUID)

uninstall:
	rm -rf "$(INSTALL_DIR)"

# Офлайн-тесты: парсинг PD/PSY на фикстуре + юнит чистых функций.
test:
	./fixtures/gen.sh
	GNOME_USB_MON_SYSFS_ROOT=fixtures/charger-100w gjs -m tests/pdo-test.js
	gjs -m tests/unit-test.js

lint:
	npx eslint .

# Извлечь переводимые строки (_()) в po/gnome-usb-mon.pot.
pot:
	mkdir -p po
	xgettext --from-code=UTF-8 --language=JavaScript --keyword=_ \
		--package-name=gnome-usb-mon --package-version=1.0 \
		-o po/gnome-usb-mon.pot \
		extension.js prefs.js ui/indicator.js
	@echo "pot → po/gnome-usb-mon.pot"

# Тест без перелогина: вложенный shell (Wayland).
reload-nested: install
	dbus-run-session -- gnome-shell --nested --wayland

pack: schemas
	gnome-extensions pack --force \
		--extra-source=lib --extra-source=ui \
		--schema=schemas/org.gnome.shell.extensions.gnome-usb-mon.gschema.xml .

clean:
	rm -f schemas/gschemas.compiled *.shell-extension.zip
