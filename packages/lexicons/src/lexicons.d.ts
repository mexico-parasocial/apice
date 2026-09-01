export declare const lexicons: readonly [{
    readonly lexicon: 1;
    readonly id: "app.civic.course";
    readonly description: "A public civic education course published on the Atmosphere.";
    readonly defs: {
        readonly main: {
            readonly type: "record";
            readonly key: "tid";
            readonly record: {
                readonly type: "object";
                readonly required: readonly ["title", "createdAt", "ownerDid"];
                readonly properties: {
                    readonly title: {
                        readonly type: "string";
                        readonly maxLength: 200;
                    };
                    readonly description: {
                        readonly type: "string";
                        readonly maxLength: 5000;
                    };
                    readonly thumbnail: {
                        readonly type: "blob";
                        readonly accept: readonly ["image/png", "image/jpeg", "image/webp"];
                        readonly maxSize: 1000000;
                    };
                    readonly createdAt: {
                        readonly type: "string";
                        readonly format: "datetime";
                    };
                    readonly ownerDid: {
                        readonly type: "string";
                        readonly format: "did";
                    };
                    readonly tags: {
                        readonly type: "array";
                        readonly maxLength: 20;
                        readonly items: {
                            readonly type: "string";
                            readonly maxLength: 50;
                        };
                    };
                    readonly sections: {
                        readonly type: "array";
                        readonly maxLength: 50;
                        readonly items: {
                            readonly type: "ref";
                            readonly ref: "#section";
                        };
                    };
                    readonly videoManifestRef: {
                        readonly type: "ref";
                        readonly ref: "com.atproto.repo.strongRef";
                    };
                };
            };
        };
        readonly section: {
            readonly type: "object";
            readonly required: readonly ["title"];
            readonly properties: {
                readonly title: {
                    readonly type: "string";
                    readonly maxLength: 200;
                };
                readonly description: {
                    readonly type: "string";
                    readonly maxLength: 1000;
                };
                readonly lessons: {
                    readonly type: "array";
                    readonly maxLength: 100;
                    readonly items: {
                        readonly type: "ref";
                        readonly ref: "com.atproto.repo.strongRef";
                    };
                };
            };
        };
    };
}, {
    readonly lexicon: 1;
    readonly id: "app.civic.courseSpace";
    readonly description: "A permissioned space controlling access to a course before or instead of public sync.";
    readonly defs: {
        readonly main: {
            readonly type: "record";
            readonly key: "tid";
            readonly record: {
                readonly type: "object";
                readonly required: readonly ["courseRef", "ownerDid", "syncMethod"];
                readonly properties: {
                    readonly courseRef: {
                        readonly type: "ref";
                        readonly ref: "com.atproto.repo.strongRef";
                    };
                    readonly ownerDid: {
                        readonly type: "string";
                        readonly format: "did";
                    };
                    readonly syncMethod: {
                        readonly type: "string";
                        readonly enum: readonly ["public", "permissioned"];
                    };
                    readonly title: {
                        readonly type: "string";
                        readonly maxLength: 200;
                    };
                    readonly readAccess: {
                        readonly type: "array";
                        readonly maxLength: 1000;
                        readonly items: {
                            readonly type: "string";
                            readonly format: "did";
                        };
                    };
                };
            };
        };
    };
}, {
    readonly lexicon: 1;
    readonly id: "app.civic.lesson";
    readonly description: "A single lesson (video + metadata) inside a civic course.";
    readonly defs: {
        readonly main: {
            readonly type: "record";
            readonly key: "tid";
            readonly record: {
                readonly type: "object";
                readonly required: readonly ["title", "durationSeconds", "courseRef", "createdAt"];
                readonly properties: {
                    readonly title: {
                        readonly type: "string";
                        readonly maxLength: 200;
                    };
                    readonly description: {
                        readonly type: "string";
                        readonly maxLength: 2000;
                    };
                    readonly durationSeconds: {
                        readonly type: "integer";
                    };
                    readonly thumbnail: {
                        readonly type: "blob";
                        readonly accept: readonly ["image/png", "image/jpeg", "image/webp"];
                        readonly maxSize: 1000000;
                    };
                    readonly createdAt: {
                        readonly type: "string";
                        readonly format: "datetime";
                    };
                    readonly courseRef: {
                        readonly type: "ref";
                        readonly ref: "com.atproto.repo.strongRef";
                    };
                    readonly videoRef: {
                        readonly type: "ref";
                        readonly ref: "com.atproto.repo.strongRef";
                    };
                    readonly order: {
                        readonly type: "integer";
                        readonly description: "Position within the course section";
                    };
                };
            };
        };
    };
}, {
    readonly lexicon: 1;
    readonly id: "app.civic.progress";
    readonly description: "A learner-signed completion attestation for a civic course or lesson.";
    readonly defs: {
        readonly main: {
            readonly type: "record";
            readonly key: "tid";
            readonly record: {
                readonly type: "object";
                readonly required: readonly ["learnerDid", "courseRef", "completedAt"];
                readonly properties: {
                    readonly learnerDid: {
                        readonly type: "string";
                        readonly format: "did";
                    };
                    readonly courseRef: {
                        readonly type: "ref";
                        readonly ref: "com.atproto.repo.strongRef";
                    };
                    readonly lessonRef: {
                        readonly type: "ref";
                        readonly ref: "com.atproto.repo.strongRef";
                    };
                    readonly completedAt: {
                        readonly type: "string";
                        readonly format: "datetime";
                    };
                    readonly progressPercent: {
                        readonly type: "integer";
                        readonly minimum: 0;
                        readonly maximum: 100;
                    };
                };
            };
        };
    };
}, {
    readonly lexicon: 1;
    readonly id: "app.civic.video";
    readonly description: "A video asset manifest pointing at CDN bytes and optional signed playback URLs.";
    readonly defs: {
        readonly main: {
            readonly type: "record";
            readonly key: "tid";
            readonly record: {
                readonly type: "object";
                readonly required: readonly ["title", "sources", "createdAt"];
                readonly properties: {
                    readonly title: {
                        readonly type: "string";
                        readonly maxLength: 200;
                    };
                    readonly sources: {
                        readonly type: "array";
                        readonly minLength: 1;
                        readonly maxLength: 10;
                        readonly items: {
                            readonly type: "ref";
                            readonly ref: "#source";
                        };
                    };
                    readonly captions: {
                        readonly type: "array";
                        readonly maxLength: 20;
                        readonly items: {
                            readonly type: "ref";
                            readonly ref: "#captionTrack";
                        };
                    };
                    readonly createdAt: {
                        readonly type: "string";
                        readonly format: "datetime";
                    };
                    readonly durationSeconds: {
                        readonly type: "integer";
                    };
                    readonly contentKey: {
                        readonly type: "string";
                        readonly description: "Optional content-addressed key / CID for provenance";
                    };
                };
            };
        };
        readonly source: {
            readonly type: "object";
            readonly required: readonly ["uri", "mediaType"];
            readonly properties: {
                readonly uri: {
                    readonly type: "string";
                    readonly format: "uri";
                };
                readonly mediaType: {
                    readonly type: "string";
                };
                readonly size: {
                    readonly type: "integer";
                };
                readonly bitrate: {
                    readonly type: "integer";
                };
                readonly resolution: {
                    readonly type: "string";
                };
            };
        };
        readonly captionTrack: {
            readonly type: "object";
            readonly required: readonly ["uri", "lang", "label"];
            readonly properties: {
                readonly uri: {
                    readonly type: "string";
                    readonly format: "uri";
                };
                readonly lang: {
                    readonly type: "string";
                };
                readonly label: {
                    readonly type: "string";
                };
            };
        };
    };
}];
export type CivicLexiconId = typeof lexicons[number]['id'];
