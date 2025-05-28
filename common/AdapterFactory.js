// common/AdapterFactory.js

export class AdapterFactory {
  static async create(gameName, config) {
    const capitalize = name => name.charAt(0).toUpperCase() + name.slice(1);

    const capName   = capitalize(gameName);
    const modulePath = `../games/${gameName}/${capName}Adapter.js`;
    const adapterMod = await import(modulePath);
    const AdapterCls = adapterMod[`${capName}Adapter`];
    return new AdapterCls(config);
  }
}
