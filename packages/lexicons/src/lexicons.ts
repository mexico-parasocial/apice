export const lexicons = [
  {
    "lexicon": 1,
    "id": "app.civic.course",
    "description": "A public civic education course published on the Atmosphere.",
    "defs": {
      "main": {
        "type": "record",
        "key": "tid",
        "record": {
          "type": "object",
          "required": [
            "title",
            "createdAt",
            "ownerDid"
          ],
          "properties": {
            "title": {
              "type": "string",
              "maxLength": 200
            },
            "description": {
              "type": "string",
              "maxLength": 5000
            },
            "thumbnail": {
              "type": "blob",
              "accept": [
                "image/png",
                "image/jpeg",
                "image/webp"
              ],
              "maxSize": 1000000
            },
            "createdAt": {
              "type": "string",
              "format": "datetime"
            },
            "ownerDid": {
              "type": "string",
              "format": "did"
            },
            "tags": {
              "type": "array",
              "maxLength": 20,
              "items": {
                "type": "string",
                "maxLength": 50
              }
            },
            "sections": {
              "type": "array",
              "maxLength": 50,
              "items": {
                "type": "ref",
                "ref": "#section"
              }
            },
            "videoManifestRef": {
              "type": "ref",
              "ref": "com.atproto.repo.strongRef"
            }
          }
        }
      },
      "section": {
        "type": "object",
        "required": [
          "title"
        ],
        "properties": {
          "title": {
            "type": "string",
            "maxLength": 200
          },
          "description": {
            "type": "string",
            "maxLength": 1000
          },
          "lessons": {
            "type": "array",
            "maxLength": 100,
            "items": {
              "type": "ref",
              "ref": "com.atproto.repo.strongRef"
            }
          }
        }
      }
    }
  },
  {
    "lexicon": 1,
    "id": "app.civic.courseSpace",
    "description": "A permissioned space controlling access to a course before or instead of public sync.",
    "defs": {
      "main": {
        "type": "record",
        "key": "tid",
        "record": {
          "type": "object",
          "required": [
            "courseRef",
            "ownerDid",
            "syncMethod"
          ],
          "properties": {
            "courseRef": {
              "type": "ref",
              "ref": "com.atproto.repo.strongRef"
            },
            "ownerDid": {
              "type": "string",
              "format": "did"
            },
            "syncMethod": {
              "type": "string",
              "enum": [
                "public",
                "permissioned"
              ]
            },
            "title": {
              "type": "string",
              "maxLength": 200
            },
            "readAccess": {
              "type": "array",
              "maxLength": 1000,
              "items": {
                "type": "string",
                "format": "did"
              }
            }
          }
        }
      }
    }
  },
  {
    "lexicon": 1,
    "id": "app.civic.lesson",
    "description": "A single lesson (video + metadata) inside a civic course.",
    "defs": {
      "main": {
        "type": "record",
        "key": "tid",
        "record": {
          "type": "object",
          "required": [
            "title",
            "durationSeconds",
            "courseRef",
            "createdAt"
          ],
          "properties": {
            "title": {
              "type": "string",
              "maxLength": 200
            },
            "description": {
              "type": "string",
              "maxLength": 2000
            },
            "durationSeconds": {
              "type": "integer"
            },
            "thumbnail": {
              "type": "blob",
              "accept": [
                "image/png",
                "image/jpeg",
                "image/webp"
              ],
              "maxSize": 1000000
            },
            "createdAt": {
              "type": "string",
              "format": "datetime"
            },
            "courseRef": {
              "type": "ref",
              "ref": "com.atproto.repo.strongRef"
            },
            "videoRef": {
              "type": "ref",
              "ref": "com.atproto.repo.strongRef"
            },
            "order": {
              "type": "integer",
              "description": "Position within the course section"
            }
          }
        }
      }
    }
  },
  {
    "lexicon": 1,
    "id": "app.civic.progress",
    "description": "A learner-signed completion attestation for a civic course or lesson.",
    "defs": {
      "main": {
        "type": "record",
        "key": "tid",
        "record": {
          "type": "object",
          "required": [
            "learnerDid",
            "courseRef",
            "completedAt"
          ],
          "properties": {
            "learnerDid": {
              "type": "string",
              "format": "did"
            },
            "courseRef": {
              "type": "ref",
              "ref": "com.atproto.repo.strongRef"
            },
            "lessonRef": {
              "type": "ref",
              "ref": "com.atproto.repo.strongRef"
            },
            "completedAt": {
              "type": "string",
              "format": "datetime"
            },
            "progressPercent": {
              "type": "integer",
              "minimum": 0,
              "maximum": 100
            }
          }
        }
      }
    }
  },
  {
    "lexicon": 1,
    "id": "app.civic.video",
    "description": "A video asset manifest pointing at CDN bytes and optional signed playback URLs.",
    "defs": {
      "main": {
        "type": "record",
        "key": "tid",
        "record": {
          "type": "object",
          "required": [
            "title",
            "sources",
            "createdAt"
          ],
          "properties": {
            "title": {
              "type": "string",
              "maxLength": 200
            },
            "sources": {
              "type": "array",
              "minLength": 1,
              "maxLength": 10,
              "items": {
                "type": "ref",
                "ref": "#source"
              }
            },
            "captions": {
              "type": "array",
              "maxLength": 20,
              "items": {
                "type": "ref",
                "ref": "#captionTrack"
              }
            },
            "createdAt": {
              "type": "string",
              "format": "datetime"
            },
            "durationSeconds": {
              "type": "integer"
            },
            "contentKey": {
              "type": "string",
              "description": "Optional content-addressed key / CID for provenance"
            }
          }
        }
      },
      "source": {
        "type": "object",
        "required": [
          "uri",
          "mediaType"
        ],
        "properties": {
          "uri": {
            "type": "string",
            "format": "uri"
          },
          "mediaType": {
            "type": "string"
          },
          "size": {
            "type": "integer"
          },
          "bitrate": {
            "type": "integer"
          },
          "resolution": {
            "type": "string"
          }
        }
      },
      "captionTrack": {
        "type": "object",
        "required": [
          "uri",
          "lang",
          "label"
        ],
        "properties": {
          "uri": {
            "type": "string",
            "format": "uri"
          },
          "lang": {
            "type": "string"
          },
          "label": {
            "type": "string"
          }
        }
      }
    }
  }
] as const

export type CivicLexiconId = typeof lexicons[number]['id'];
