import { ParticipantNotFoundError } from '../../../common/exceptions/application.exceptions';
import { ConfigurationValidationError } from '../../../common/exceptions/configuration-validation.error';
import { aParticipantDefinition } from '../../../test-support/builders';
import { ParticipantRegistry } from './participant.registry';

function registryOf(
  definitions: readonly ReturnType<typeof aParticipantDefinition>[],
): ParticipantRegistry {
  return new ParticipantRegistry({ definitions });
}

describe('ParticipantRegistry', () => {
  it('exposes every configured participant and only the enabled ones for the public lists', () => {
    const registry = registryOf([
      aParticipantDefinition({ id: 'one', gameName: 'One' }),
      aParticipantDefinition({ id: 'two', gameName: 'Two', enabled: false }),
    ]);

    expect(registry.all()).toHaveLength(2);
    expect(registry.enabled().map((definition) => definition.id)).toEqual(['one']);
  });

  it('rejects duplicated participant ids while booting', () => {
    expect(() =>
      registryOf([
        aParticipantDefinition({ id: 'same', gameName: 'One' }),
        aParticipantDefinition({ id: 'same', gameName: 'Two' }),
      ]),
    ).toThrow(ConfigurationValidationError);
  });

  it('rejects duplicated Riot IDs regardless of casing', () => {
    expect(() =>
      registryOf([
        aParticipantDefinition({ id: 'one', gameName: 'PlayerOne', tagLine: 'LAN' }),
        aParticipantDefinition({ id: 'two', gameName: 'playerone', tagLine: 'lan' }),
      ]),
    ).toThrow(ConfigurationValidationError);
  });

  it('rejects identifiers that could escape the storage directory', () => {
    expect(() => registryOf([aParticipantDefinition({ id: '../escape' })])).toThrow(
      ConfigurationValidationError,
    );
    expect(() => registryOf([aParticipantDefinition({ id: '' })])).toThrow(
      ConfigurationValidationError,
    );
  });

  it('rejects empty Riot ID parts', () => {
    expect(() => registryOf([aParticipantDefinition({ gameName: '  ' })])).toThrow(
      ConfigurationValidationError,
    );
    expect(() => registryOf([aParticipantDefinition({ tagLine: '' })])).toThrow(
      ConfigurationValidationError,
    );
  });

  it('accepts an empty roster', () => {
    expect(registryOf([]).all()).toEqual([]);
  });

  it('finds participants and fails explicitly for unknown ids', () => {
    const registry = registryOf([aParticipantDefinition({ id: 'one' })]);

    expect(registry.find('one')?.id).toBe('one');
    expect(registry.find('missing')).toBeNull();
    expect(registry.require('one').id).toBe('one');
    expect(() => registry.require('missing')).toThrow(ParticipantNotFoundError);
  });

  it('formats the Riot ID of a definition', () => {
    const registry = registryOf([
      aParticipantDefinition({ id: 'one', gameName: 'PlayerOne', tagLine: 'LAN' }),
    ]);

    expect(registry.riotIdOf(registry.require('one'))).toBe('PlayerOne#LAN');
  });
});
