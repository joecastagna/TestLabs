package com.catsnap.sighting;

import com.catsnap.auth.CurrentUser;
import com.catsnap.generated.tables.records.SightingsRecord;
import org.jooq.DSLContext;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.MediaTypeFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.math.BigDecimal;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import java.math.RoundingMode;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;

import static com.catsnap.generated.Tables.SIGHTINGS;
import static com.catsnap.generated.Tables.USERS;

@RestController
@RequestMapping("/api/sightings")
public class SightingController {

    private static final Logger log = LoggerFactory.getLogger(SightingController.class);

    private final DSLContext dsl;

    @Value("${app.upload.dir:/app/uploads}")
    private String uploadDir;

    @Value("${app.classifier.url:http://classifier:8001}")
    private String classifierUrl;

    private static final Map<String, List<String>> CAT_NAMES = Map.of(
        "tabby",   List.of("Stripe", "Tiger", "Tabs", "Mara", "Brindle"),
        "tuxedo",  List.of("Felix", "Panda", "Dapper", "Butler", "Tux"),
        "orange",  List.of("Blaze", "Cheddar", "Paprika", "Saffron", "Cheeto"),
        "black",   List.of("Shadow", "Midnight", "Onyx", "Ember", "Raven"),
        "white",   List.of("Snowflake", "Ghost", "Pearl", "Blizzard", "Cotton"),
        "calico",  List.of("Patches", "Mosaic", "Quilt", "Pixel", "Confetti"),
        "spotted", List.of("Dot", "Freckles", "Dapple", "Speckle", "Spot"),
        "other",   List.of("Mystery", "Whiskers", "Mittens", "Pumpkin", "Biscuit")
    );

    public SightingController(DSLContext dsl) {
        this.dsl = dsl;
    }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<?> create(
            @RequestParam String color,
            @RequestParam String pattern,
            @RequestParam(required = false) String description,
            @RequestParam BigDecimal latitude,
            @RequestParam BigDecimal longitude,
            @RequestParam(required = false) BigDecimal gpsLatitude,
            @RequestParam(required = false) BigDecimal gpsLongitude,
            @RequestPart(name = "photo", required = false) MultipartFile photo,
            @CurrentUser String email) throws IOException {

        Long userId = resolveUserId(email);
        if (userId == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();

        // Classify photo before saving (best-effort; null if classifier unreachable)
        ClassifierResult classification = (photo != null && !photo.isEmpty())
                ? callClassifier(photo) : null;

        String photoPath = null;
        if (photo != null && !photo.isEmpty()) {
            String ext = StringUtils.getFilenameExtension(photo.getOriginalFilename());
            String filename = UUID.randomUUID() + (ext != null ? "." + ext : "");
            Path dir = Paths.get(uploadDir);
            Files.createDirectories(dir);
            Files.copy(photo.getInputStream(), dir.resolve(filename));
            photoPath = filename;
        }

        String coatTypeDetected = classification != null ? classification.coatType() : null;
        BigDecimal coatConfidence = classification != null
                ? BigDecimal.valueOf(classification.confidence()).setScale(4, RoundingMode.HALF_UP)
                : null;
        String coatForName = coatTypeDetected != null ? coatTypeDetected : color.toLowerCase();
        String catName = generateCatName(coatForName);

        SightingsRecord created = dsl.insertInto(SIGHTINGS)
                .columns(SIGHTINGS.USER_ID, SIGHTINGS.COLOR, SIGHTINGS.PATTERN, SIGHTINGS.DESCRIPTION,
                         SIGHTINGS.LATITUDE, SIGHTINGS.LONGITUDE,
                         SIGHTINGS.GPS_LATITUDE, SIGHTINGS.GPS_LONGITUDE, SIGHTINGS.PHOTO_PATH,
                         SIGHTINGS.COAT_TYPE_DETECTED, SIGHTINGS.COAT_CONFIDENCE, SIGHTINGS.CAT_NAME)
                .values(userId, color, pattern, description,
                        latitude, longitude,
                        gpsLatitude, gpsLongitude, photoPath,
                        coatTypeDetected, coatConfidence, catName)
                .returning()
                .fetchOne();

        return ResponseEntity.status(HttpStatus.CREATED).body(toSighting(created));
    }

    @PostMapping(value = "/classify-preview", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<?> classifyPreview(@RequestPart("file") MultipartFile file) {
        if (file == null || file.isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("error", "No file provided"));
        }
        ClassifierResult result = callClassifier(file);
        if (result == null) {
            return ResponseEntity.ok(Map.of("coatType", "other", "confidence", 0.0));
        }
        return ResponseEntity.ok(result);
    }

    @GetMapping("/photo/{filename:.+}")
    public ResponseEntity<Resource> servePhoto(@PathVariable String filename) throws IOException {
        Path filePath = Paths.get(uploadDir).resolve(filename).normalize();
        if (!filePath.startsWith(Paths.get(uploadDir).normalize())) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }
        Resource resource = new FileSystemResource(filePath);
        if (!resource.exists()) return ResponseEntity.notFound().build();
        MediaType mediaType = MediaTypeFactory.getMediaType(resource).orElse(MediaType.APPLICATION_OCTET_STREAM);
        return ResponseEntity.ok().contentType(mediaType).body(resource);
    }

    @GetMapping
    public List<Sighting> list() {
        return dsl.selectFrom(SIGHTINGS)
                .orderBy(SIGHTINGS.CREATED_AT.desc())
                .fetch()
                .map(this::toSighting);
    }

    @GetMapping("/mine")
    public ResponseEntity<?> mine(@CurrentUser String email) {
        Long userId = resolveUserId(email);
        if (userId == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();

        return ResponseEntity.ok(
                dsl.selectFrom(SIGHTINGS)
                        .where(SIGHTINGS.USER_ID.eq(userId))
                        .orderBy(SIGHTINGS.CREATED_AT.desc())
                        .fetch()
                        .map(this::toSighting)
        );
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> delete(@PathVariable long id, @CurrentUser String email) {
        Long userId = resolveUserId(email);
        if (userId == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();

        Long ownerId = dsl.select(SIGHTINGS.USER_ID)
                .from(SIGHTINGS)
                .where(SIGHTINGS.ID.eq(id))
                .fetchOne(SIGHTINGS.USER_ID);

        if (ownerId == null) return ResponseEntity.status(HttpStatus.NOT_FOUND).build();
        if (!ownerId.equals(userId)) return ResponseEntity.status(HttpStatus.FORBIDDEN).build();

        dsl.deleteFrom(SIGHTINGS).where(SIGHTINGS.ID.eq(id)).execute();
        return ResponseEntity.noContent().build();
    }

    private Long resolveUserId(String email) {
        return dsl.select(USERS.ID)
                .from(USERS)
                .where(USERS.EMAIL.eq(email))
                .fetchOne(USERS.ID);
    }

    private ClassifierResult callClassifier(MultipartFile photo) {
        try {
            byte[] bytes = photo.getBytes();
            String filename = photo.getOriginalFilename() != null ? photo.getOriginalFilename() : "upload.jpg";

            MultiValueMap<String, Object> body = new LinkedMultiValueMap<>();
            body.add("file", new ByteArrayResource(bytes) {
                @Override public String getFilename() { return filename; }
            });

            org.springframework.http.HttpHeaders headers = new org.springframework.http.HttpHeaders();
            headers.setContentType(MediaType.MULTIPART_FORM_DATA);

            return new RestTemplate().postForObject(
                    classifierUrl + "/classify",
                    new org.springframework.http.HttpEntity<>(body, headers),
                    ClassifierResult.class);
        } catch (Exception e) {
            log.warn("Classifier call failed ({}): {}", classifierUrl, e.getMessage());
            return null;
        }
    }

    private String generateCatName(String coatType) {
        List<String> names = CAT_NAMES.getOrDefault(
                coatType != null ? coatType.toLowerCase() : "other",
                CAT_NAMES.get("other")
        );
        return names.get(ThreadLocalRandom.current().nextInt(names.size()));
    }

    private Sighting toSighting(SightingsRecord r) {
        String photoPath = r.getPhotoPath();
        String photoUrl = photoPath != null ? "/api/sightings/photo/" + photoPath : null;
        BigDecimal conf = r.getCoatConfidence();
        return new Sighting(r.getId(), r.getColor(), r.getPattern(), r.getDescription(),
                            r.getLatitude(), r.getLongitude(), r.getCreatedAt(), photoUrl,
                            r.getCoatTypeDetected(), conf != null ? conf.doubleValue() : null,
                            r.getCatName());
    }

    private record ClassifierResult(String coatType, double confidence) {}

    record Sighting(long id, String color, String pattern, String description,
                    BigDecimal latitude, BigDecimal longitude, OffsetDateTime createdAt,
                    String photoUrl, String coatTypeDetected, Double coatConfidence,
                    String catName) {}
}
