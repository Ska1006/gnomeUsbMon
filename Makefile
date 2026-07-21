UUID = gnome-usb-mon@ska1006.github.io
DOMAIN = gnome-usb-mon
INSTALL_DIR = $(HOME)/.local/share/gnome-shell/extensions/$(UUID)
FILES = metadata.json extension.js prefs.js stylesheet.css lib ui schemas locale

LOCALES = $(wildcard po/*.po)
MO = $(patsubst po/%.po,locale/%/LC_MESSAGES/$(DOMAIN).mo,$(LOCALES))

.PHONY: all schemas mo install uninstall enable disable reload-nested pack test lint pot clean

all: schemas mo

schemas: schemas/gschemas.compiled

schemas/gschemas.compiled: schemas/*.gschema.xml
	glib-compile-schemas schemas/

# Компиляция переводов po/<lang>.po → locale/<lang>/LC_MESSAGES/<domain>.mo
mo: $(MO)

locale/%/LC_MESSAGES/$(DOMAIN).mo: po/%.po
	mkdir -p $(dir $@)
	msgfmt $< -o $@

install: schemas mo
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
	bash fixtures/gen.sh
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
		--podir=po \
		--schema=schemas/org.gnome.shell.extensions.gnome-usb-mon.gschema.xml .

clean:
	rm -f schemas/gschemas.compiled *.shell-extension.zip
	rm -rf locale
