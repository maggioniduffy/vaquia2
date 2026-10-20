import { describe, expect, it } from "vitest";
import type { Payload } from "@/forms/compile";
import type { Section } from "@/forms/dsl";
import type {
  RefCrew,
  RefLocation,
  RefPersona,
  RefQualificationStatus,
  RefTaskType,
} from "@/lib/offline/reference-types";
import ats from "@/forms/seeds/ats.v1.json";
import toolboxTalk from "@/forms/seeds/toolbox_talk.v1.json";
import {
  applyDerived,
  buildReferences,
  contextOf,
  findField,
  participantsOf,
  signerIds,
  worstStatuses,
} from "./derive";

// Phase 2.5/2.6 — values derived from the payload: crew -> location, envelope participants and the
// list of people who must sign (spec/forms.md#Field types, data-model.md#Records).

const toolboxSections = (toolboxTalk as unknown as { sections: Section[] }).sections;
const atsSections = (ats as unknown as { sections: Section[] }).sections;

const crew = (id: string, locationId: string | null): RefCrew => ({
  id,
  name: `Crew ${id}`,
  location_id: locationId,
  supervisor_persona_id: null,
});

const location = (id: string): RefLocation => ({
  id,
  name: `Location ${id}`,
  field: null,
  lat: null,
  lng: null,
});

describe("findField / contextOf", () => {
  it("reads the crew, location and task type from the form's own keys", () => {
    const toolbox: Payload = { crew: "c1", location: "l1" };
    expect(contextOf(toolboxSections, toolbox)).toEqual({
      crew_id: "c1",
      location_id: "l1",
      task_type_id: undefined,
    });
    expect(contextOf(atsSections, { task_type: "tt1" })).toEqual({
      crew_id: undefined,
      location_id: undefined,
      task_type_id: "tt1",
    });
  });

  it("ignores non-string reference values", () => {
    expect(contextOf(toolboxSections, { crew: 42, location: ["l1"] })).toEqual({
      crew_id: undefined,
      location_id: undefined,
      task_type_id: undefined,
    });
  });

  it("only finds top-level fields", () => {
    expect(findField(atsSections, "task_type")?.key).toBe("task_type");
    expect(findField(toolboxSections, "task_type")).toBeUndefined();
  });
});

describe("applyDerived: crew fills the location", () => {
  const crews = [crew("c1", "l1"), crew("c2", "l2"), crew("c3", null), crew("c4", "missing")];
  const locations = [location("l1"), location("l2")];

  it("sets the crew's location when the crew changes", () => {
    const next = applyDerived(
      toolboxSections,
      { crew: "c1", location: "l1" },
      { crew: "c2", location: "l1" },
      crews,
      locations,
    );
    expect(next.location).toBe("l2");
  });

  it("leaves a manual location change alone when the crew did not change", () => {
    const next = applyDerived(
      toolboxSections,
      { crew: "c1", location: "l1" },
      { crew: "c1", location: "l2" },
      crews,
      locations,
    );
    expect(next.location).toBe("l2");
  });

  it("does not clear an existing location when the new crew has none", () => {
    const next = applyDerived(
      toolboxSections,
      { crew: "c1", location: "l1" },
      { crew: "c3", location: "l1" },
      crews,
      locations,
    );
    expect(next.location).toBe("l1");
  });

  it("ignores a crew location that is not in the cached list", () => {
    const next = applyDerived(
      toolboxSections,
      { crew: "c1", location: "l1" },
      { crew: "c4", location: "l1" },
      crews,
      locations,
    );
    expect(next.location).toBe("l1");
  });

  it("returns the payload unchanged for a form without crew or location fields", () => {
    const next = { task_type: "tt1" };
    expect(applyDerived(atsSections, {}, next, crews, locations)).toBe(next);
  });
});

describe("participantsOf", () => {
  it("maps the toolbox attendees to the 'attendee' role", () => {
    expect(
      participantsOf(toolboxSections, {
        attendees: ["p1", "p2"],
      }),
    ).toEqual([
      { persona_id: "p1", role: "attendee" },
      { persona_id: "p2", role: "attendee" },
    ]);
  });

  it("maps the ATS participants to the 'signer' role", () => {
    expect(participantsOf(atsSections, { participants: ["p1"] })).toEqual([
      { persona_id: "p1", role: "signer" },
    ]);
  });

  it("dedupes a persona that appears twice with the same role", () => {
    const sections: Section[] = [
      {
        key: "people",
        title: "People",
        fields: [
          { key: "a", type: "persona", label: "A", multiple: true, role: "attendee" },
          { key: "b", type: "persona", label: "B", multiple: true, role: "attendee" },
        ],
      },
    ];
    expect(participantsOf(sections, { a: ["p1", "p2"], b: ["p2", "p3"] })).toEqual([
      { persona_id: "p1", role: "attendee" },
      { persona_id: "p2", role: "attendee" },
      { persona_id: "p3", role: "attendee" },
    ]);
  });

  it("keeps the same persona under two different roles", () => {
    const sections: Section[] = [
      {
        key: "people",
        title: "People",
        fields: [
          { key: "a", type: "persona", label: "A", multiple: true, role: "attendee" },
          { key: "b", type: "persona", label: "B", multiple: true, role: "responsible" },
        ],
      },
    ];
    expect(participantsOf(sections, { a: ["p1"], b: ["p1"] })).toEqual([
      { persona_id: "p1", role: "attendee" },
      { persona_id: "p1", role: "responsible" },
    ]);
  });

  it("ignores persona fields without a role", () => {
    const sections: Section[] = [
      {
        key: "people",
        title: "People",
        fields: [{ key: "a", type: "persona", label: "A", multiple: true }],
      },
    ];
    expect(participantsOf(sections, { a: ["p1"] })).toEqual([]);
  });
});

describe("signerIds", () => {
  it("returns everyone picked in a signature: true persona field", () => {
    expect(signerIds(toolboxSections, { attendees: ["p1", "p2"] })).toEqual(["p1", "p2"]);
    expect(signerIds(atsSections, { participants: ["p1"] })).toEqual(["p1"]);
  });

  it("excludes persona fields that are not signed", () => {
    const sections: Section[] = [
      {
        key: "people",
        title: "People",
        fields: [
          {
            key: "signed",
            type: "persona",
            label: "Signed",
            multiple: true,
            signature: true,
          },
          { key: "listed", type: "persona", label: "Listed", multiple: true },
        ],
      },
    ];
    expect(signerIds(sections, { signed: ["p1"], listed: ["p2"] })).toEqual(["p1"]);
  });

  it("accepts a single persona id as well as a list", () => {
    const sections: Section[] = [
      {
        key: "people",
        title: "People",
        fields: [{ key: "who", type: "persona", label: "Who", signature: true }],
      },
    ];
    expect(signerIds(sections, { who: "p1" })).toEqual(["p1"]);
    expect(signerIds(sections, { who: 42 })).toEqual([]);
  });
});

describe("qualification status in the references", () => {
  const status = (
    persona: string,
    value: RefQualificationStatus["status"],
  ): RefQualificationStatus => ({
    persona_id: persona,
    task_type_id: "tt",
    qualification_type_id: "qt",
    status: value,
    expires_on: null,
    days_left: null,
  });

  it("keeps the worst status per persona", () => {
    expect(
      worstStatuses([
        status("p1", "valid"),
        status("p1", "expiring"),
        status("p2", "missing"),
        status("p2", "valid"),
        status("p3", "expired"),
        status("p3", "missing"),
      ]),
    ).toEqual({ p1: "expiring", p2: "missing", p3: "expired" });
  });

  it("builds the renderer references, including the crew filter", () => {
    const personas: RefPersona[] = [
      { id: "p1", full_name: "Ana Pérez", dni: "1", crew_id: "c1" },
    ];
    const crews: RefCrew[] = [crew("c1", "l1")];
    const locations: RefLocation[] = [{ ...location("l1"), name: "Pozo A", field: "Vaca Muerta" }];
    const taskTypes: RefTaskType[] = [{ id: "tt1", company_id: null, code: "t", name: "Tarea" }];

    expect(
      buildReferences({
        personas,
        crews,
        locations,
        taskTypes,
        qualifications: [status("p1", "expired")],
        crewId: "c1",
      }),
    ).toEqual({
      personas: [{ key: "p1", label: "Ana Pérez" }],
      crews: [{ key: "c1", label: "Crew c1" }],
      locations: [{ key: "l1", label: "Vaca Muerta – Pozo A" }],
      taskTypes: [{ key: "tt1", label: "Tarea" }],
      personaInfo: { p1: { dni: "1", crewId: "c1", status: "expired" } },
      crewId: "c1",
    });
  });
});
